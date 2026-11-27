import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Browser } from '@playwright/test';
import type { MeasureInput, MeasureResult, prepare, run } from './hdPackMeasureScene';
import type { GraphicsBackendPreference } from '../src/graphicsBackend';

/**
 * WM-34 / H457's measurement (a test instrument, product track, a browser adaptation; no original, no game value): one
 * arm of the HD pack's before/after -- `S2U_HD_MEASURE_PACK` a pack directory (manifest.json and its payloads: the DDS
 * pack as served, or its KTX2 conversion), `S2U_HD_MEASURE_FILES` an optional list of payload numbers or names, one a
 * line (one map's set; all of the pack without it), `S2U_HD_MEASURE_GRAPHICS` the backend asked (`auto`, Automatic's
 * WebGPU, by default; or `webgl2`), `S2U_HD_MEASURE_ARM` the arm's name for the record, `S2U_HD_MEASURE_OUT` a JSON
 * file the result is also written to. Payloads are served from the directory by a route (no server change). It prints
 * one line and the JSON: the time to every apply settled and to the first frame after, the GPU bytes the runtime
 * counts (`appliedBytes`), how many went up as blocks, the JS heap, and on Windows the browser's GPU and renderer
 * processes' memory read from the system (`Get-Process`, and the `GPU Process Memory` counters' dedicated and shared
 * usage) before the pack and after it. Skips, saying so, without a pack. One arm a run: each its own browser.
 */
const PACK = process.env['S2U_HD_MEASURE_PACK'];
const GRAPHICS = (process.env['S2U_HD_MEASURE_GRAPHICS'] ?? 'auto') as GraphicsBackendPreference;
const ARM = process.env['S2U_HD_MEASURE_ARM'] ?? 'unnamed';

interface ProcMem { pid: number; type: string; workingSet: number; privateBytes: number; gpuDedicated: number; gpuShared: number }

/** The browser's GPU and renderer processes (`SystemInfo.getProcessInfo`), their pids. */
async function processes(browser: Browser): Promise<{ id: number; type: string }[]> {
  const cdp = await browser.newBrowserCDPSession();
  try { return ((await cdp.send('SystemInfo.getProcessInfo')) as { processInfo: { id: number; type: string }[] }).processInfo; }
  finally { await cdp.detach(); }
}
/** Windows only: each process's working set, private bytes and GPU memory (dedicated and shared), from the system. */
function sample(procs: { id: number; type: string }[]): ProcMem[] | string {
  if (process.platform !== 'win32') return 'not Windows: no system memory read';
  const ids = procs.filter((p) => p.type === 'GPU' || p.type === 'gpu-process' || p.type === 'renderer' || p.type === 'browser');
  const script = ids.map((p) => `$p=Get-Process -Id ${p.id} -ErrorAction SilentlyContinue; `
    + `$c=(Get-Counter -ErrorAction SilentlyContinue '\\GPU Process Memory(pid_${p.id}_*)\\Dedicated Usage','\\GPU Process Memory(pid_${p.id}_*)\\Shared Usage').CounterSamples; `
    + `$d=($c | ? { $_.Path -like '*dedicated usage' } | Measure-Object CookedValue -Sum).Sum; $s=($c | ? { $_.Path -like '*shared usage' } | Measure-Object CookedValue -Sum).Sum; `
    + `Write-Output ('${p.id} ${p.type} ' + [int64]$p.WorkingSet64 + ' ' + [int64]$p.PrivateMemorySize64 + ' ' + [int64]$d + ' ' + [int64]$s)`).join('; ');
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 60_000 });
    return out.trim().split(/\r?\n/).map((l) => { const [pid, type, ws, pb, gd, gs] = l.trim().split(' '); return { pid: +pid!, type: type!, workingSet: +ws!, privateBytes: +pb!, gpuDedicated: +gd!, gpuShared: +gs! }; });
  } catch (e) { return `the system read failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`; }
}

test(`HD pack measurement: arm ${ARM}, graphics ${GRAPHICS}`, async ({ page, browser }, testInfo) => {
  test.skip(!PACK || !existsSync(join(PACK, 'manifest.json')), 'no S2U_HD_MEASURE_PACK with a manifest.json: the measurement needs a pack on this host');
  const dir = PACK!;
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as MeasureInput['manifest'];
  const listed = process.env['S2U_HD_MEASURE_FILES'];
  const stems = listed ? new Set(readFileSync(listed, 'utf8').split(/\r?\n/).map((l) => l.trim().replace(/\.[a-z0-9]+$/i, '')).filter(Boolean)) : null;
  const files = [...new Set(manifest.entries.map((e) => e.file))].filter((f) => !stems || stems.has(f.replace(/\.[a-z0-9]+$/i, '')));
  expect(files.length, 'the list names payloads of this pack').toBeGreaterThan(0);
  await page.route(/\/__hd-measure(?:\?|$)/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.route(/\/__hd-measure\/pack\/((?:0|[1-9]\d{0,4})\.(?:dds|ktx2|png))$/, (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    return route.fulfill({ path: join(dir, name), contentType: 'application/octet-stream' });
  });
  // The page's warnings and errors (a backend fallback names its reason there) kept for the record.
  const consoleLines: string[] = [];
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') consoleLines.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${String(e).slice(0, 300)}`));
  await page.goto('/__hd-measure');
  const input: MeasureInput = { files, graphics: GRAPHICS, root: '/__hd-measure/pack/', manifest };
  const prep = await page.evaluate(async (i) => {
    const path = '/e2e/hdPackMeasureScene.ts';
    return ((await import(/* @vite-ignore */ path)) as { prepare: typeof prepare }).prepare(i);
  }, input);
  const procs = await processes(browser);
  const before = sample(procs);
  const result: MeasureResult = await page.evaluate(async () => {
    const path = '/e2e/hdPackMeasureScene.ts';
    return ((await import(/* @vite-ignore */ path)) as { run: typeof run }).run();
  });
  const after = sample(await processes(browser));
  const record = { arm: ARM, graphicsAsked: GRAPHICS, renderer: process.env['S2U_E2E_RENDERER'] ?? 'default', pack: dir, payloads: files.length, prepare: prep, result, memory: { before, after }, console: consoleLines.slice(0, 50), at: new Date().toISOString() };
  const json = JSON.stringify(record, null, 1);
  writeFileSync(testInfo.outputPath('hd-measure.json'), json);
  if (process.env['S2U_HD_MEASURE_OUT']) writeFileSync(process.env['S2U_HD_MEASURE_OUT'], json);
  const gpu = (m: ProcMem[] | string) => typeof m === 'string' ? m : m.filter((p) => /gpu/i.test(p.type)).map((p) => `${Math.round(p.gpuDedicated / 2 ** 20)} MiB dedicated, ${Math.round(p.privateBytes / 2 ** 20)} MiB private`).join('; ');
  const line = `[hd-measure] arm ${ARM}, asked ${GRAPHICS}: backend ${result.backend} (read from the page; ${String(prep.gpuProbe['userAgent'] ?? 'no agent').replace(/^.*\) /, '')});${result.textures} textures (${prep.placedLeftOut} placement entries left out); `
    + `applied ${result.applied} (${result.compressed} as blocks, ${result.rgba} RGBA), skipped ${result.skipped}; apply ${result.ms.apply} ms + first frame ${result.ms.firstFrame} ms; `
    + `runtime GPU bytes ${Math.round(result.appliedBytes / 2 ** 20)} MiB; fetched ${Math.round(result.fetchedBytes / 2 ** 20)} MiB; GPU process before: ${gpu(before)}; after: ${gpu(after)}`;
  console.log(line);
  console.log(json);
  testInfo.annotations.push({ type: 'hd-measure', description: line });
  expect(result.applied + result.skipped, 'every texture applied or skipped with a reason').toBeGreaterThan(0);
});
