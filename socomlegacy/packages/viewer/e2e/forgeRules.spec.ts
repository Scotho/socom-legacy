import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { forgeAuthoringText } from '../src/forge/rulesAuthoring';
import { vaultLayout } from '../test/forge/rulesFixture';

/**
 * FCW-32 step 4 (FUI-18's rules half, FUI.R23; product track, a browser adaptation with no original): the rendered pass
 * of the Forge's Rules panel, by pointer and by pad. Pointer: name the layout, New rules, a rule added as text, a zone
 * placed from the panel's place mode, Check, Play reading "PLAY · <mode name>", Back, the layout downloaded (its rules
 * with it) and opened again. A layout with a configured mode opened from a file: a configuration value by the dock's
 * stepper, and by the pad -- START, the d-pad to the Rules section's row, right -- with no keyboard; START > Panels >
 * Rules hands the panel the pad, the d-pad walks it. Screenshots `fcw32-rules-{1280,760}.png` go to `FORGE_SHOTS_DIR`
 * (or the test's output). Needs a served archive (`socomlegacy/public/maps`); without one it is skipped, not passed.
 */
const MAPS = fileURLToPath(new URL('../../../public/maps', import.meta.url));
const HAVE = existsSync(join(MAPS, 'index.json')) && existsSync(join(MAPS, 'RUN', 'MP2.ZDB'));

test.skip(!HAVE, 'needs socomlegacy/public/maps/index.json and RUN/MP2.ZDB (not committed)');
test.setTimeout(300_000);

/** The standard mapping (`../src/forge/pad`): Cross 0, START 9, d-pad down 13, right 15. */
const CROSS = 0, START = 9, DOWN = 13, RIGHT = 15;

const shot = async (page: Page, name: string, out: string): Promise<void> => {
  const dir = process.env['FORGE_SHOTS_DIR'] ?? out;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `fcw32-rules-${name}.png`) });
};
const open = async (page: Page, size: { width: number; height: number }): Promise<void> => {
  await page.setViewportSize(size);
  await page.goto('/forge?devmode');
  await expect(page.locator('.fx-vp-label')).toContainText('·', { timeout: 120_000 });
  if (size.width <= 760) await page.locator('.fx-top button[aria-label="Docks"]').click();
};
const rules = (page: Page) => page.locator('.fx-right details.fx-panel[data-forge-panel="rules"]');
const control = (page: Page, key: string) => rules(page).locator(`[data-rules-key="${key}"]`);
const showRules = async (page: Page): Promise<void> => {
  await page.locator('.fx-right [data-forge-tab="object"]').click();
  if (!(await rules(page).evaluate((d) => (d as HTMLDetailsElement).open))) await rules(page).locator(':scope > summary').click();
};
/** A virtual pad (the Gamepad API read by `../src/forge/pad`), before the page loads. */
const withPad = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = { id: 'e2e pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons };
    (window as unknown as { __e2ePad: typeof pad }).__e2ePad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  });
};
const press = async (page: Page, button: number): Promise<void> => {
  const set = (down: boolean) => page.evaluate(([i, d]) => {
    const p = (window as unknown as { __e2ePad: { timestamp: number; buttons: { pressed: boolean; value: number }[] } }).__e2ePad;
    p.buttons[i as number]!.pressed = d as boolean; p.buttons[i as number]!.value = d ? 1 : 0; p.timestamp++;
  }, [button, down] as const);
  await set(true);
  await page.waitForTimeout(120);
  await set(false);
  await page.waitForTimeout(120);
};
const menuRow = (page: Page): Promise<string> => page.evaluate(() => document.querySelector<HTMLElement>('.fx-menu li.is-on')?.dataset['forgeMenuRow'] ?? '');

for (const size of [{ width: 1280, height: 720 }, { width: 760, height: 720 }]) {
  test(`by pointer: New rules, a rule as text, a zone, Check, Play reads PLAY · Vault, Back, download and open again, at ${size.width}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, size);
    await page.getByLabel('Layout name').fill('Vault');
    await page.getByLabel('Layout name').press('Enter');
    await showRules(page);
    await expect(rules(page)).toContainText('No rules.');
    await control(page, 'new').click();
    await expect(control(page, 'rule-add')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Game type')).toHaveValue('mode:vault@1.0.0');
    // A rule as text: refused by its field first, then saved.
    await control(page, 'rule-add').click();
    await control(page, 'rule-text').fill(JSON.stringify({ id: 'hello', when: 'round.start', then: [{ do: 'no.such.action' }] }));
    await control(page, 'rule-save').click();
    await expect(rules(page).locator('[data-rules-error]')).toContainText('at rules[0].then[0].do');
    await control(page, 'rule-text').fill(JSON.stringify({ id: 'hello', when: 'round.start', then: [{ do: 'message.show', text: 'Find the vault' }] }));
    await control(page, 'rule-save').click();
    await expect(control(page, 'rule-open:hello')).toHaveText('hello · when round.start · 1 action');
    // A zone from the panel's place mode: the next click on the world.
    await control(page, 'place:zone').click();
    const box = (await page.locator('.fx-input').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.62);
    await expect(page.locator('ul.fx-outliner li[data-rules-entity="zone:zone1"]')).toBeVisible();
    await expect(page.locator('.fx-input')).toHaveAttribute('data-rules-gizmos', 'zone:zone1');
    await control(page, 'check').click();
    await expect(rules(page).locator('[data-rules-clear]')).toBeVisible();
    await shot(page, String(size.width), info.outputPath());
    // Play: the mode's name beside Back; Back to the editor.
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const proceed = page.getByRole('button', { name: 'Play anyway' });
    if (await proceed.isVisible({ timeout: 5_000 }).catch(() => false)) await proceed.click();
    await expect(page.locator('[data-forge-chips="match"]')).toContainText('PLAY · Vault', { timeout: 120_000 });
    await expect(page.locator('.fx-input')).toHaveAttribute('data-rules-gizmos', '');
    await page.locator('.fx-match-back').click();
    await expect(page.locator('.fx-input')).toHaveAttribute('data-rules-gizmos', 'zone:zone1', { timeout: 60_000 });
    // Download (the layout and its rules), a new layout, the file opened again: the rules and the zone return.
    if (size.width <= 760 && !(await page.locator('[data-forge="saves"]').isVisible())) await page.locator('.fx-top button[aria-label="Docks"]').click();
    await page.locator('[data-forge="saves"]').click();
    const download = page.waitForEvent('download');
    await page.locator('.fx-modal').getByRole('button', { name: 'Download' }).click();
    const file = await (await download).path();
    if (!file) throw new Error('the layout file was not downloaded');
    await page.locator('.fx-modal').getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Start a new layout' }).click();
    await page.getByRole('button', { name: 'Start new' }).click();
    await expect(rules(page)).toContainText('No rules.');
    await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles(file);
    await showRules(page);
    await expect(control(page, 'rule-open:hello')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('ul.fx-outliner li[data-rules-entity="zone:zone1"]')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('a configured mode: a value by the dock\'s stepper, then by the pad with no keyboard; START > Panels > Rules hands it the pad', async ({ page }, info) => {
  await withPad(page);
  await open(page, { width: 1280, height: 720 });
  // The fixture's layout (a vault zone, a mode of three values, two rules) opened from a file.
  const made = forgeAuthoringText(await vaultLayout(), 'Vault');
  if (!('text' in made)) throw new Error(made.why);
  const file = info.outputPath('vault.json');
  mkdirSync(info.outputPath(), { recursive: true });
  writeFileSync(file, made.text);
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles(file);
  await showRules(page);
  await expect(control(page, 'config:reward')).toHaveValue('9', { timeout: 60_000 });
  await expect(page.getByLabel('Game type')).toHaveValue('mode:vault.run@1.0.0');
  // By pointer: the stepper.
  await control(page, 'config:reward').fill('12');
  await control(page, 'config:reward').press('Tab');
  await expect(control(page, 'config:reward')).toHaveValue('12');
  // By pad: START, the d-pad to the Rules section's reward row, right one step.
  await page.mouse.move(1, 1);
  await press(page, START);
  await expect(page.locator('.fx-padmenu')).toBeVisible();
  for (let n = 0; n < 160 && (await menuRow(page)) !== 'rules-config-reward'; n++) await press(page, DOWN);
  expect(await menuRow(page)).toBe('rules-config-reward');
  await press(page, RIGHT);
  await expect(page.locator('.fx-menu li[data-forge-menu-row="rules-config-reward"]')).toContainText('13');
  // START > Panels > Rules: the panel takes the pad; the d-pad walks its controls; Cross opens a rule's read view.
  for (let n = 0; n < 160 && (await menuRow(page)) !== 'panel-rules'; n++) await press(page, DOWN);
  expect(await menuRow(page)).toBe('panel-rules');
  await press(page, CROSS);
  await expect(rules(page).locator('.is-pad-focused')).toHaveAttribute('data-rules-key', 'config:reward');
  for (let n = 0; n < 40; n++) {
    if ((await rules(page).locator('.is-pad-focused').getAttribute('data-rules-key')) === 'rule-open:pay') break;
    await press(page, DOWN);
  }
  await press(page, CROSS);
  await expect(control(page, 'rule-open:pay')).toHaveAttribute('aria-expanded', 'true');
  await expect(control(page, 'config:reward')).toHaveValue('13');
  await shot(page, 'pad-1280', info.outputPath());
});
