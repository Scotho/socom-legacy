import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser } from '@playwright/test';
// The debug hook's shape, types only (see `viewer.spec.ts`).
import type {} from '../src/hook';
import { budgetTable, type BudgetRun, type LoadPhase } from '@s2u/ui';
import { OpenedContexts } from './openedContexts';
import { TEST_ROOM } from './urls';

/** The contexts this spec opens on the worker's browser, closed after each test -- a failed one's too (issues #91, #117). */
const opened = new OpenedContexts();
test.afterEach(() => opened.closeAll());

/**
 * PLAT-29a (web research 100, plan ruling W6.R4): the load budget's table, measured. Dev-host only and opt-in: it runs
 * with `S2U_PERF=1`, a local ISO (`SOCOM_ISO`, else `SOCOM_PC_ROOT`'s `game/` image) and the extracted tree under
 * `socomlegacy/public/maps/`; anywhere else it skips. A browser run is CPU-heavy: on the PC project's host it runs only
 * while `loop_lock.sh check` prints FREE (the plan's host rules), on its own port (5301+, never 5181 or 8787):
 *
 *   S2U_PERF=1 E2E_PORT=5301 npx playwright test packages/viewer/e2e/loadBudget.spec.ts
 *
 * Each load is a fresh browser context (its own HTTP cache): the served tree at `/?devmode`, the player's ISO at `/`
 * handed to the disc page's file input, `RUNS` of each. The marks are the page's (`window.__viewer.phases()`,
 * `../src/loadBudget`); the table is `@s2u/ui`'s `budgetTable`, printed and written to `test-results/load-budget.md`
 * (git-ignored) for the note. No threshold: PLAT-29b's.
 */
const PERF = process.env['S2U_PERF'] === '1';
const PC_ROOT = process.env['SOCOM_PC_ROOT'];
const ISO = process.env['SOCOM_ISO']
  ?? (PC_ROOT ? join(PC_ROOT, 'game', 'SOCOM II - U.S. Navy SEALs (USA).iso') : '');
const MAPS_INDEX = fileURLToPath(new URL('../../../public/maps/index.json', import.meta.url));
const OUT = fileURLToPath(new URL('../../../test-results/load-budget.md', import.meta.url));
/** Loads of each source: the first served one also pays Vite's first transform of the modules, so more than one. */
const RUNS = Number(process.env['S2U_PERF_RUNS'] ?? 3);

test.skip(!PERF, 'the load budget runs on the dev host alone: S2U_PERF=1');
test.skip(!ISO || !existsSync(ISO), 'no local ISO: SOCOM_ISO or SOCOM_PC_ROOT');
test.skip(!existsSync(MAPS_INDEX), 'no served tree: run npm run extract-maps');
test.setTimeout(600_000);

/** One cold load in its own context: opens the page, gives it the disc when `iso`, waits for the map, reads the marks. */
async function measure(browser: Browser, baseURL: string, iso: boolean): Promise<{ marks: Partial<Record<LoadPhase, number>>; loadMs: number; map: string | null }> {
  const context = opened.add(await browser.newContext({ baseURL }));
  try {
    const page = await context.newPage();
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(iso ? TEST_ROOM : `${TEST_ROOM}?devmode`);
    if (iso) {
      await expect(page.locator('#disc-page')).toBeVisible();
      await page.locator('#disc-page-file').setInputFiles(ISO);
    }
    await expect(page.locator('#status')).toContainText('triangles', { timeout: 300_000 });
    const marks = await page.evaluate(() => window.__viewer.phases?.() ?? {});
    const stats = await page.evaluate(() => window.__viewer.stats());
    expect(problems).toEqual([]);
    expect(stats.source).toBe(iso ? 'iso' : 'http');
    expect(marks.discIndexed).toBeGreaterThan(0);
    expect(marks.mapFirstFrame).toBeGreaterThan(marks.discIndexed!);
    if (iso) expect(marks.discChosen).toBeLessThan(marks.discIndexed!);
    return { marks, loadMs: stats.loadMs, map: stats.map };
  } finally {
    await context.close();
  }
}

test('the load budget: every phase that exists, from the served tree and from a local ISO (PLAT-29a)', async ({ browser, baseURL }) => {
  const runs: BudgetRun[] = [];
  const notes: string[] = [];
  for (const iso of [false, true]) {
    for (let i = 1; i <= RUNS; i++) {
      const r = await measure(browser, baseURL!, iso);
      const label = `${iso ? 'ISO' : 'served'} #${i}`;
      runs.push({ label, marks: r.marks });
      notes.push(`${label}: ${r.map}, the worker's load ${r.loadMs} ms`);
    }
  }
  const table = budgetTable(runs);
  const text = [
    `# The load budget, measured ${new Date().toISOString()} (PLAT-29a)`, '',
    table, '',
    ...notes.map((n) => `- ${n}`), '',
  ].join('\n');
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(text);
  expect(runs).toHaveLength(2 * RUNS);
});
