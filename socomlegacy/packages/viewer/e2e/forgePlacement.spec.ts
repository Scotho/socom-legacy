import { expect, test, type Page } from '@playwright/test';

/**
 * FORGE placement aids (FG-5, FG-49; a browser adaptation, no original). The no-disc bench (`/forge?bench`) places
 * the forge's own block -- no disc. Ten clicks in Place mode each leave a piece on the floor (a click on the gizmo of
 * the piece just placed still places). Copy and paste keep a group's offsets, and undo puts the layout back.
 */

type Pt = [number, number, number];

const piecesOf = (raw: string | null): Pt[] => {
  if (!raw) return [];
  return raw.split(';').filter(Boolean).map((s) => {
    const [x, y, z] = s.split(',').map(Number);
    return [x!, y!, z!];
  });
};

const readPieces = (page: Page): Promise<Pt[]> =>
  page.locator('.fx-input').getAttribute('data-pieces').then(piecesOf);

const byPlace = (pts: Pt[]): Pt[] => [...pts].sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);

const deltas = (pts: Pt[]): Pt[] => {
  const o = pts[0]!;
  return pts.slice(1).map((p) => [p[0] - o[0], p[1] - o[1], p[2] - o[2]]);
};

test.describe('forge placement on a blank floor', () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/forge?bench');
    await expect(page.locator('.fx-status-msg')).toHaveText('blank floor');
    await expect(page.locator('.fx-input')).toHaveAttribute('data-ghost', '1');
    (page as unknown as { fxErrors: string[] }).fxErrors = errors;
  });

  test('ten place clicks leave ten pieces, each resting on the floor', async ({ page }) => {
    const input = page.locator('.fx-input');
    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    const b = box!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(b.x + 12, b.y + 12);
      await page.mouse.move(cx, cy);
      await page.mouse.click(cx, cy);
      await expect.poll(async () => (await readPieces(page)).length, { timeout: 10_000 }).toBe(i + 1);
    }
    const placed = await readPieces(page);
    expect(placed).toHaveLength(10);
    for (const p of placed) expect(p[1]).toBeCloseTo(0, 1);
    await page.screenshot({ path: test.info().outputPath('forge-ten-places.png') });
    expect((page as unknown as { fxErrors: string[] }).fxErrors).toEqual([]);
  });

  test('copy and paste keep a group\'s offsets, and undo restores the three', async ({ page }) => {
    const input = page.locator('.fx-input');
    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    const b = box!;
    const spots = [0.32, 0.5, 0.68];
    for (let i = 0; i < spots.length; i++) {
      const x = b.x + b.width * spots[i]!;
      const y = b.y + b.height * (i === 1 ? 0.42 : 0.62);
      await page.mouse.move(b.x + 12, b.y + 12);
      await page.mouse.move(x, y);
      await page.mouse.click(x, y);
      await expect.poll(async () => (await readPieces(page)).length, { timeout: 10_000 }).toBe(i + 1);
    }
    const original = await readPieces(page);
    expect(original).toHaveLength(3);
    const spread = Math.hypot(original[1]![0] - original[0]![0], original[1]![2] - original[0]![2]);
    expect(spread).toBeGreaterThan(1);

    await page.getByRole('button', { name: /^Select/ }).click();
    const rows = page.locator('.fx-outliner > li');
    await rows.nth(0).locator('span').first().click();
    await rows.nth(1).locator('span').first().click({ modifiers: ['Shift'] });
    await rows.nth(2).locator('span').first().click({ modifiers: ['Shift'] });
    await page.keyboard.press('Control+c');
    await expect(page.locator('.fx-status-msg')).toHaveText('copied 3');

    await page.mouse.move(b.x + b.width * 0.78, b.y + b.height * 0.35);
    await page.keyboard.press('Control+v');
    await expect.poll(async () => (await readPieces(page)).length, { timeout: 10_000 }).toBe(6);
    const after = await readPieces(page);
    const before = byPlace(original);
    const pasted = byPlace(after.slice(3));
    const d0 = deltas(before);
    const d1 = deltas(pasted);
    expect(d1).toHaveLength(d0.length);
    d1.forEach((d, i) => {
      expect(d[0]).toBeCloseTo(d0[i]![0], 1);
      expect(d[1]).toBeCloseTo(d0[i]![1], 1);
      expect(d[2]).toBeCloseTo(d0[i]![2], 1);
    });
    await page.screenshot({ path: test.info().outputPath('forge-paste-group.png') });

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await readPieces(page)).length, { timeout: 10_000 }).toBe(3);
    const restored = byPlace(await readPieces(page));
    restored.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(before[i]![0], 1);
      expect(p[1]).toBeCloseTo(before[i]![1], 1);
      expect(p[2]).toBeCloseTo(before[i]![2], 1);
    });
    expect((page as unknown as { fxErrors: string[] }).fxErrors).toEqual([]);
  });
});
