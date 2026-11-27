import { expect, test, type Locator, type Page } from '@playwright/test';
import { focusItem, walkRailTo } from './launcherRail';

/**
 * WM-PACKS-SETTING (the owner's ruling, 2026-11-15; INTAKE 56, "quietly shown size"; product track, a browser adaptation
 * that changes nothing the game does): Settings > Game > Display's Texture pack row on the launcher's live page (`/`) at
 * 400x860, the phone's width. Its line is ONE line (`console.css`: nowrap, ellipsis), and the chosen pack's size sits
 * quietly beside its name in the choice, Original none.
 *
 * First the page's own MODS adapter, on an empty browser: the row reads MODS' list through its `open()` and says "No
 * texture packs added yet.". Then two synthetic packs (no disc data, no pack file): a stand-in MODS view handed to the
 * page's own `setTexturePackSource` (`../src/console/texturePackSetting.ts`, as Vite serves it to the page), the
 * real row drawn from it -- "2 packs added", a long HD pack name with MODS' own "4600.0 MB decoded" beside it (the name
 * ellipsizes, the size stays whole, one line at 400 wide; review F1 of 62193b190f); a step to Original calls the stand-in's
 * `setTexture` once with null and the size is gone. A rendered browser run: the host's lock rules apply.
 */
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 400, height: 860 } });

const HD = `hd:${'a'.repeat(64)}`;
const GX = `texture:MP51:${'b'.repeat(64)}`;

declare global { interface Window { __tpCalls?: (string | null)[] } }

/** Home polls the universe; the run has no central, so it is answered with none (as `./modsScreen.ts` does). */
async function quiet(page: Page): Promise<void> {
  await page.route('**/texts/universe', async (route) => {
    if (route.request().method() !== 'POST') { await route.fallback(); return; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ universes: [], news: [] }) });
  });
}

/** Settings > Game: its first tab, Display. */
async function openDisplay(page: Page): Promise<void> {
  await walkRailTo(page, 'Settings');
  await focusItem(page, 'Game');
  await page.keyboard.press('Enter');
  await expect(page.locator('#stage h1')).toHaveText('Display');
}

const row = (page: Page): Locator => page.locator('#stage .cx-r[data-id="texture-pack"]');

/** The row's line and its choice each lie on one line, unclipped (the line's height is one line-height). */
async function oneLine(el: Locator): Promise<{ lines: number; clipped: boolean; nowrap: boolean }> {
  return el.evaluate((n) => {
    const cs = getComputedStyle(n);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.35;
    return { lines: Math.round(n.getBoundingClientRect().height / lh), clipped: n.scrollWidth > n.clientWidth + 1, nowrap: cs.whiteSpace === 'nowrap' };
  });
}

test('Display: Texture pack\'s line is one line at 400 wide; the chosen pack\'s size sits quietly beside its name', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await quiet(page);
  await page.goto('/');
  await expect(page.locator('#stage .cx-cat.is-current')).toHaveCount(1, { timeout: 60_000 });
  await openDisplay(page);

  // The page's own MODS adapter, nothing added: the row reads the list once and says so, on one line.
  const r = row(page);
  await r.scrollIntoViewIfNeeded();
  const hint = r.locator('.cx-r__hint');
  await expect(hint).toHaveText('No texture packs added yet.', { timeout: 30_000 });
  await expect(r.locator('.cx-r__choice')).toHaveText('Original');
  expect(await oneLine(hint)).toEqual({ lines: 1, clipped: false, nowrap: true });
  await expect(page.locator('#stage .cx-r[data-id="texture-pack-mods"]')).toContainText('Add or remove packs in Mods');
  await page.screenshot({ path: testInfo.outputPath('texture-pack-none-400x860.png') });

  // Two synthetic packs through the page's own source hand-off; the row drawn afresh (Display left and opened again).
  await page.evaluate(async ({ hd, gx }) => {
    const m = await import(/* @vite-ignore */ '/src/console/texturePackSetting.ts' as string) as typeof import('../src/console/texturePackSetting');
    const calls: (string | null)[] = [];
    window.__tpCalls = calls;
    const v = { ready: true, busy: null, message: null, storePage: null, texture: hd as string | null,
      textures: [{ id: null, label: 'Original' }, { id: hd, label: 'The test HD pack with a long name' }, { id: gx, label: 'GX test' }], rows: [] };
    const none = (): void => {};
    const sizes: Record<string, string> = { [hd]: '4600.0 MB decoded', [gx]: '3.0 MB' };
    m.setTexturePackSource({ open: none, view: () => v, choose: none, drop: none, toggle: none, remove: none, move: none,
      setTexture: (id: string | null) => { calls.push(id); v.texture = id; } } as never, (id) => sizes[id] ?? null);
  }, { hd: HD, gx: GX });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#stage h1')).not.toHaveText('Display');
  await page.keyboard.press('Enter');
  await expect(page.locator('#stage h1')).toHaveText('Display');

  await r.scrollIntoViewIfNeeded();
  await expect(hint).toHaveText('2 packs added');
  const choice = r.locator('.cx-r__choice');
  await expect(choice.locator('.cx-r__name')).toHaveText('The test HD pack with a long name');
  await expect(choice.locator('.cx-r__size')).toHaveText('4600.0 MB decoded');
  await expect(r).toHaveAttribute('aria-label', /^Texture pack: The test HD pack with a long name, 4600\.0 MB decoded/);
  // the size kept whole and inside the choice; the name gives way (ellipsis) when the two do not fit
  const fit = await choice.evaluate((c) => {
    const s = c.querySelector('.cx-r__size')!, n = c.querySelector('.cx-r__name')!;
    const cr = c.getBoundingClientRect(), sr = s.getBoundingClientRect();
    return { sizeWhole: s.scrollWidth <= s.clientWidth + 1, sizeInside: sr.right <= cr.right + 1 && sr.left >= cr.left - 1,
      nameEllipsis: getComputedStyle(n).textOverflow, inViewport: cr.right <= innerWidth };
  });
  expect(fit).toEqual({ sizeWhole: true, sizeInside: true, nameEllipsis: 'ellipsis', inViewport: true });
  expect(await oneLine(hint)).toEqual({ lines: 1, clipped: false, nowrap: true });
  expect((await oneLine(choice)).lines).toBe(1);
  // quiet: the size is smaller and fainter than the name beside it
  const tone = await choice.evaluate((c) => {
    const s = c.querySelector('.cx-r__size')!;
    return { name: parseFloat(getComputedStyle(c).fontSize), size: parseFloat(getComputedStyle(s).fontSize), opacity: parseFloat(getComputedStyle(s).opacity) };
  });
  expect(tone.size).toBeLessThan(tone.name);
  expect(tone.opacity).toBeLessThan(1);
  await page.screenshot({ path: testInfo.outputPath('texture-pack-400x860.png') });

  // One step back to Original: the stand-in's setTexture once, with null; Original shows no size.
  // The write first, then the draw, so a red says which half failed: no call (the click never reached the row's step) or
  // a call with no redraw (the row not drawn afresh). The stand-in's view follows its write, as MODS' does.
  // As a mouse player does: the row clicked (it takes the focus: its About says so), then its left arrow. The first press of
  // a mouse after the keys switches the console to the pointer's mode (`../src/console/input.ts`); a click that switch
  // swallowed is retried, and said by the About check, never by a write.
  const aside = page.locator('#stage .cx-aside');
  await expect(async () => {
    await r.locator('.cx-r__label').click();
    await expect(aside).toContainText('Which of the texture packs', { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  expect(await page.evaluate(() => window.__tpCalls)).toEqual([]);                  // the focusing click wrote nothing
  await r.locator('[data-act="optstep"][data-d="-1"]').click();
  await expect.poll(() => page.evaluate(() => window.__tpCalls), { message: 'the step reached setTexture', timeout: 10_000 }).toEqual([null]);
  await expect(choice, 'the row drawn afresh after the write').toHaveText('Original', { timeout: 10_000 });
  await expect(choice.locator('.cx-r__size')).toHaveCount(0);
  expect(await oneLine(hint)).toEqual({ lines: 1, clipped: false, nowrap: true });
  await page.screenshot({ path: testInfo.outputPath('texture-pack-original-400x860.png') });
  expect(problems).toEqual([]);
});
