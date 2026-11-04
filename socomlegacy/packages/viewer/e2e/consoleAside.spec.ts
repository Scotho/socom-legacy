import { expect, test, type Page } from '@playwright/test';
import { walkRailTo } from './launcherRail';

/**
 * CX-ASIDE (issue #251; the console launcher plan `docs/plans/2026-10-11-console-launcher.md`, its row CX-ASIDE; the
 * product track, OT.R53): the console's Options side panel ("About this option", `.cx-aside`) keeps a readable width,
 * and no roller beside it is clipped, at the viewports the issue names -- 1280x720 and 1366x768 (the fit's 0.8 floor,
 * `src/console/fit.ts`) and 1920x1080 (the design's own) -- and at 1024x768, where the Options screen is narrower than
 * the tabs, the rows' least width and the aside's (79.75rem) and the aside moves under the tabs, in their column (`src/console/console.css`,
 * CX-ASIDE; the seat's decision of 2026-10-17: the rows keep the body's full height). The front-end seat measured the panel 67 px wide at 1280x720 on `main` 05b3108ee, its text one word a
 * line. On the live page (`/`; no disc, no server: the Options screen needs neither) and on the sample adapters'
 * (`/console?sample`, whose rollers carry values), each Options category in turn (R1), each of its rows focused in turn
 * (the D-pad's Down), the drawn boxes:
 *
 * 1. **the aside**: at least 19rem wide (the page's least width, in the root font-size the fit set), beside the rows
 *    (its left past their right) or under the tabs (its top past their bottom, inside their column left of the rows,
 *    the rows then as tall as the tabs and the aside together); its heading and text inside its box;
 * 2. **no row clipped**: the rows' list does not overflow sideways; in each roller its label's text, its controls and
 *    its value's text lie inside the roller and the list, the label's text left of the controls, the value's text
 *    inside its pill;
 * 3. **1920x1080 unchanged**: beside the rows, the rows at the design's 57.5rem, the aside the 25.25rem the design
 *    leaves it.
 *
 * A text box is its text node's range (`Range.getBoundingClientRect`). A browser adaptation with no original (the
 * project's own launcher page, OT.R28): nothing of the game runs. A rendered browser run: the host's lock rules apply,
 * and it runs in the controller's slot; its first green run closes #251.
 */
test.use({ actionTimeout: 15_000 });
test.setTimeout(5 * 60_000);

const PAGES: readonly (readonly [string, string])[] = [['live', '/'], ['sample', '/console?sample']];
const VIEWPORTS: readonly (readonly [number, number])[] = [[1280, 720], [1366, 768], [1920, 1080], [1024, 768]];
/** The aside's least width, in rem (`src/console/console.css`, CX-ASIDE). */
const ASIDE_MIN_REM = 19;
const SLACK = 0.5;

interface Box { l: number; r: number; t: number; b: number }
interface Roller { label: string; roller: Box; text: Box; ctl: Box | null; value: Box; valueText: Box | null }
interface Seen {
  rem: number; rows: Box; tabs: Box; aside: Box; asidePad: number; asideText: Box[]; overflowX: number;
  rollers: Roller[]; focused: string;
}

/** The Options screen as drawn: the rows' and the aside's boxes, each roller's parts and their text boxes. */
const seen = (page: Page): Promise<Seen> => page.evaluate((): Seen => {
  const box = (r: DOMRect): Box => ({ l: r.left, r: r.right, t: r.top, b: r.bottom });
  const text = (el: Element): Box => { const g = document.createRange(); g.selectNodeContents(el); return box(g.getBoundingClientRect()); };
  const rows = document.querySelector<HTMLElement>('#stage .cx-rows')!;
  // LR-26: the rows' slide-in (`cx-lx-row-in`, 1.375rem from the right) is a transform, which a scroll box counts as sideways
  // overflow (scrollWidth - clientWidth: the 5-17 px the box read on every Options category after LR-24's scrollbar rule, which
  // changed nothing: `console.css` hid every `[data-scroll]` scrollbar since CX-11). Waiting for the animation was a race with the
  // stage's first frame, so each read ends it in the same turn it measures: a finished animation is the settled drawing.
  for (const a of rows.getAnimations({ subtree: true })) { try { a.finish(); } catch { /* an unending one has no end to jump to */ } }
  const aside = document.querySelector<HTMLElement>('#stage .cx-aside')!;
  // LR-5: the rows are LR-1's row kinds (the grammar's `optrow`): the label, the control (a select's or a slider's
  // `.cx-r__ctl`, a toggle's pill, an action's arrow) and the word where the value was (a choice, a value, an action's hint).
  const rollers = [...rows.querySelectorAll<HTMLElement>('[data-act="optrow"]')].map((el): Roller => {
    const label = el.querySelector<HTMLElement>('.cx-r__label')!;
    // An Appearance pick (LR-5) shows no value: its swatches or picture and its mark (`.cx-r__side`) stand where the value was.
    const value = el.querySelector<HTMLElement>('.cx-r__choice, .cx-r__ctl .cx-r__value, .cx-r__pill, .cx-r__arrow, .cx-r__value, .cx-r__mark')!;
    const ctl = el.querySelector<HTMLElement>('.cx-r__ctl, .cx-r__pill, .cx-r__arrow, .cx-r__side');
    return {
      label: label.textContent?.trim() ?? '', roller: box(el.getBoundingClientRect()), text: text(label),
      ctl: ctl ? box(ctl.getBoundingClientRect()) : null, value: box(value.getBoundingClientRect()),
      valueText: value.textContent?.trim() ? text(value) : null,
    };
  });
  return {
    rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
    rows: box(rows.getBoundingClientRect()), tabs: box(document.querySelector('#stage .cx-tabs')!.getBoundingClientRect()),
    aside: box(aside.getBoundingClientRect()),
    asidePad: parseFloat(getComputedStyle(aside).paddingLeft),
    asideText: [...aside.children].map((c) => text(c)),
    overflowX: rows.scrollWidth - rows.clientWidth,
    rollers, focused: document.querySelector('#stage [data-act="optrow"].is-focused .cx-r__label')?.textContent?.trim() ?? '',
  };
});

/** Until the drawing stands still (the screen's entrance, the rows' slide-in and a scroll settled). */
async function settle(page: Page): Promise<Seen> {
  // The rows' slide-in (`cx-lx-row-in`, 1.375rem from the right) is a pending animation until the stage's first frame is
  // drawn -- two equal reads 80 ms apart can both be its start (the box's run on d88e98b5a: the first two rows of each
  // category read 1.375rem - 5px past the list, the later ones in it) -- so its end is awaited before the reads.
  await page.evaluate(() => Promise.all((document.querySelector('#stage .cx-rows')?.getAnimations({ subtree: true }) ?? []).map((a) => a.finished.catch(() => undefined))));
  let last = '';
  let s = await seen(page);
  for (let k = 0; k < 40; k++) {
    const key = JSON.stringify([s.rows, s.aside, s.rollers.map((x) => x.roller), s.overflowX]);   // LR-5: a row still sliding in (cx-lx-row-in, 22px) widens the list's scroll width until it stops
    if (key === last) return s;
    last = key;
    await page.waitForTimeout(80);
    s = await seen(page);
  }
  return s;
}

/** Checks 1 and 2 on one drawing; whether the aside sits beside the rows. */
function readable(s: Seen, where: string): boolean {
  const a = s.aside;
  const width = a.r - a.l;
  expect.soft(width, `${where}: the aside ${width.toFixed(1)} px, at least ${ASIDE_MIN_REM}rem (${(ASIDE_MIN_REM * s.rem).toFixed(1)} px)`).toBeGreaterThanOrEqual(ASIDE_MIN_REM * s.rem - SLACK);
  const beside = a.l >= s.rows.r - SLACK;
  const under = a.t >= s.tabs.b - SLACK && a.l >= s.tabs.l - SLACK && a.r <= s.rows.l + SLACK;
  expect.soft(beside || under, `${where}: the aside [${a.l.toFixed(1)}, ${a.t.toFixed(1)}, ${a.r.toFixed(1)}] neither beside the rows (their right ${s.rows.r.toFixed(1)}) nor under the tabs (their bottom ${s.tabs.b.toFixed(1)}, the rows' left ${s.rows.l.toFixed(1)})`).toBe(true);
  for (const [i, t] of s.asideText.entries()) {
    if (t.r === t.l) continue;
    expect.soft(t.l, `${where}: the aside's line ${i} cut at the left`).toBeGreaterThanOrEqual(a.l + s.asidePad - SLACK);
    expect.soft(t.r, `${where}: the aside's line ${i} past its box`).toBeLessThanOrEqual(a.r - s.asidePad + SLACK);
  }
  expect.soft(s.overflowX, `${where}: the rows' list overflows sideways by ${s.overflowX} px`).toBeLessThanOrEqual(0);
  if (!beside) {
    // Under the tabs, the rows keep the body's full height: from the tabs' top to the aside's bottom (or below it).
    expect.soft(s.rows.t, `${where}: the rows start level with the tabs`).toBeLessThanOrEqual(s.tabs.t + SLACK);
    expect.soft(s.rows.b, `${where}: the rows reach past the aside's bottom`).toBeGreaterThanOrEqual(a.b - SLACK);
  }
  for (const x of s.rollers) {
    const at = `${where}: ${x.label}`;
    const r = x.roller;
    expect.soft(r.l, `${at}: the roller cut at the list's left`).toBeGreaterThanOrEqual(s.rows.l - SLACK);
    expect.soft(r.r, `${at}: the roller cut at the list's right`).toBeLessThanOrEqual(s.rows.r + SLACK);
    expect.soft(x.text.l, `${at}: the label cut at the left`).toBeGreaterThanOrEqual(r.l - SLACK);
    const next = x.ctl ?? x.value;
    expect.soft(x.text.r, `${at}: the label's text [${x.text.l.toFixed(1)}, ${x.text.r.toFixed(1)}] runs under its control at ${next.l.toFixed(1)}`).toBeLessThanOrEqual(next.l + SLACK);
    expect.soft(next.r, `${at}: the control cut at the roller's right`).toBeLessThanOrEqual(r.r + SLACK);
    if (x.valueText) {
      expect.soft(x.valueText.l, `${at}: the value's text past its pill's left`).toBeGreaterThanOrEqual(x.value.l - SLACK);
      expect.soft(x.valueText.r, `${at}: the value's text past its pill's right`).toBeLessThanOrEqual(x.value.r + SLACK);
    }
  }
  return beside;
}

/** The Options screen open, from the crossbar's Options category (Enter on its first action). */
async function options(page: Page, url: string, w: number, h: number): Promise<string[]> {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(url);
  const current = page.locator('#stage .cx-cat.is-current .cx-cat__label');
  await expect(current).toHaveCount(1);
  await walkRailTo(page, 'Settings', (dir) => page.keyboard.press(dir < 0 ? 'ArrowLeft' : 'ArrowRight')); // LR.R2: left of Home
  await expect(current).toHaveText('Settings');
  await page.keyboard.press('Enter');
  await expect(page.locator('#stage .cx-screen[data-key="options"] .cx-aside')).toHaveCount(1);
  return (await page.locator('#stage .cx-tab').allTextContents()).map((t) => t.trim());
}

for (const [name, url] of PAGES) {
  for (const [w, h] of VIEWPORTS) {
    test(`${name} page at ${w}x${h}: on every Options category and row the aside is readable and no roller is clipped`, async ({ page }) => {
      const tabs = await options(page, url, w, h);
      expect(tabs.length).toBeGreaterThan(0);
      const first = (await page.locator('#stage .cx-tab.is-current').textContent())?.trim() ?? '';
      const start = tabs.indexOf(first);
      expect(start, `${w}x${h}: the first category among the tabs`).toBeGreaterThanOrEqual(0);
      for (let k = 0; k < tabs.length; k++) {
        const cat = tabs[(start + k) % tabs.length]!;
        if (k > 0) await page.keyboard.press('e');                      // R1: the next category, its first row
        await expect(page.locator('#stage .cx-tab.is-current')).toHaveText(cat);
        const n = await page.locator('#stage .cx-rows [data-act="optrow"]').count();
        expect(n, `${w}x${h} ${cat}: its rows`).toBeGreaterThan(0);
        for (let i = 0; i < n; i++) {
          if (i > 0) await page.keyboard.press('ArrowDown');
          const s = await settle(page);
          const where = `${name} ${w}x${h} ${cat} row ${i} (${s.focused})`;
          const beside = readable(s, where);
          if (w === 1920 && h === 1080) {
            // 3. the design's own size: nothing moved (the rows' box carries their 5px focus-ring room each side, CX-11).
            expect.soft(beside, `${where}: beside the rows`).toBe(true);
            expect.soft(s.rows.r - s.rows.l - 10, `${where}: the rows at 57.5rem`).toBeCloseTo(57.5 * s.rem, 0);
            expect.soft(s.aside.r - s.aside.l, `${where}: the aside at 25.25rem`).toBeCloseTo(25.25 * s.rem, 0);
          }
          if ((w === 1280 && h === 720) || (w === 1366 && h === 768)) expect.soft(beside, `${where}: beside the rows at Interface 100 %`).toBe(true);
          if (w === 1024) expect.soft(beside, `${where}: under the tabs (the Options screen under 79.75rem)`).toBe(false);
        }
      }
    });
  }
}
