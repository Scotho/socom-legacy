import { expect, test } from '@playwright/test';
import type {} from '../src/hook';
import { holdReleased } from './loadHold';

test('all flash levels render their onset and recovery in native and PS2 pictures', async ({ page }, info) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined }));
  await page.route(/\/__flash-envelope(\?.*)?$/, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  // GLOW_TARGET_SCALE_ADAPTATION: the native glow read at the full target (this SwiftShader page would take half).
  await page.goto('/__flash-envelope?glowscale=full');
  const rows = await page.evaluate(async () => {
    const path = '/e2e/flashInvestigationScene.ts';
    const scene: typeof import('./flashInvestigationScene') = await import(/* @vite-ignore */ path);
    return scene.measureEnvelope();
  });
  await info.attach('flash-envelope', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' });
  console.log('FLASH ENVELOPES', JSON.stringify(rows.map(r => ({ mode: r.mode, level: r.level,
    samples: r.samples.map((s: { t: number; rgb: number[]; state: { fix: number } }) => [s.t, s.rgb, s.state.fix]) }))));
  for (const row of rows) {
    const at = (t: number) => row.samples.find((s: { t: number }) => s.t === t)!;
    // Original FIX keys ramp from 0 to 2 over 0.2 seconds, then x128/truncate/clamp (research 202 §8.2).
    // Decimal key times can truncate one FIX unit differently in JS doubles versus PS2 floats.
    // This checks the envelope with that explicit tolerance, not bit-exact arithmetic parity.
    for (const [t, fix] of [[0, 0], [0.05, 64], [0.1, 128], [0.15, 192], [0.2, 255]]) {
      expect(Math.abs(at(t!).state.fix - fix!)).toBeLessThanOrEqual(1);
    }
    const last = row.samples.at(-1)!;
    expect(last.rgb).toEqual([7, 7, 12]);
    expect(last.state.level).toBeNull();
    expect(last.state.wash).toBeNull();
    const peak = at(0.2);
    expect(peak.rgb.every((v: number) => v >= 250)).toBe(true);
    for (let i = 1; i < row.samples.length; i++) {
      const a = row.samples[i - 1]!, b = row.samples[i]!;
      expect(b.error).toBe(0);
      for (let c = 0; c < 3; c++) {
        if (b.t <= 0.2) expect(b.rgb[c]).toBeGreaterThanOrEqual(a.rgb[c]!);
        else expect(b.rgb[c]).toBeLessThanOrEqual(a.rgb[c]!);
      }
    }
  }
});

test('flash wash reaches uncovered background pixels in native and PS2 pictures', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined }));
  await page.route(/\/__flash-background(\?.*)?$/, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  // GLOW_TARGET_SCALE_ADAPTATION: the native glow read at the full target (this SwiftShader page would take half).
  await page.goto('/__flash-background?glowscale=full');
  const results = await page.evaluate(async () => {
    const path = '/e2e/flashInvestigationScene.ts';
    return (await import(/* @vite-ignore */ path)).measureClear();
  });
  console.log('FLASH CLEAR PIXELS', JSON.stringify(results));
  for (const result of results) {
    expect(result.normal.rgb).toEqual([7, 7, 12]);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(result.wash.rgb[i] - [65.75, 65.75, 69.5][i]!)).toBeLessThanOrEqual(1);
      expect(Math.abs(result.changedBase.rgb[i] - [75.5, 83, 90.5][i]!)).toBeLessThanOrEqual(1);
    }
    expect(result.repeatedWash.rgb).toEqual(result.wash.rgb);
    for (const channel of result.flash.rgb) expect(channel).toBeGreaterThanOrEqual(250);
    expect(result.restored.rgb).toEqual([7, 7, 12]);
    for (const frame of [result.normal, result.wash, result.repeatedWash, result.changedBase, result.flash, result.restored]) expect(frame.error).toBe(0);
  }
});

// Investigation evidence: real Frostfire renders, not an original-console parity claim.
test('Frostfire flash: capture visible gameplay before, during and after the effect', async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined }));
  await page.goto('/testroom?mode=play&map=MP2&view=modern&online=off&devmode&noarmory&nomatch&kit=54,15,123,153,121');
  await expect(page.locator('#status')).toContainText('triangles');
  await holdReleased(page);
  await expect.poll(() => page.evaluate(() => window.__viewer.audio().banks.length)).toBeGreaterThanOrEqual(3);
  await page.keyboard.press('Backquote');
  await expect.poll(() => page.evaluate(() => window.__viewer.audio().unlocked)).toBe(true);
  await page.evaluate(() => {
    window.__viewer.setMode('walk');
    window.__viewer.setCamera({ x: 796, y: 115.4, z: 614, yaw: 210, pitch: -9.167 });
    window.__viewer.walkFor(0.3, { forward: 0 });
  });
  const evidence: unknown[] = [];
  for (const yaw of [210, 0, 120]) {
    await page.evaluate(yaw => window.__viewer.setCamera({ yaw }), yaw);
    await page.waitForTimeout(500);
    await page.locator('#view').screenshot({ path: info.outputPath(`frostfire-${yaw}-before.png`) });
    expect(await page.evaluate(() => window.__viewer.selectItem('Mark141'))).toBe(true);
    const bangs = await page.evaluate(() => window.__viewer.audio().byName['.MARK_141_FLASH'] ?? 0);
    expect(await page.evaluate(() => window.__viewer.throwGrenade(0.1))).not.toBeNull();
    await expect.poll(() => page.evaluate(() => window.__viewer.whiteOut().level), { timeout: 8000 }).not.toBeNull();
    await page.waitForTimeout(300);
    evidence.push(await page.evaluate(() => ({ flash: window.__viewer.whiteOut(), stats: window.__viewer.stats(), loading: window.__viewer.loading() })));
    await page.locator('#view').screenshot({ path: info.outputPath(`frostfire-${yaw}-flash.png`) });
    await expect.poll(() => page.evaluate(() => window.__viewer.whiteOut().level), { timeout: 15000 }).toBeNull();
    expect(await page.evaluate(() => window.__viewer.audio().byName['.MARK_141_FLASH'] ?? 0)).toBe(bangs + 1);
    await page.locator('#view').screenshot({ path: info.outputPath(`frostfire-${yaw}-after.png`) });
  }
  await info.attach('flash-readings', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('Frostfire flash: isolate wash and glow on the same stationary picture', async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined }));
  await page.goto('/testroom?mode=play&map=MP2&view=modern&online=off&devmode&noarmory&nomatch');
  await expect(page.locator('#status')).toContainText('triangles');
  await holdReleased(page);
  await page.evaluate(() => {
    window.__viewer.setMode('walk');
    window.__viewer.setCamera({ x: 796, y: 115.4, z: 614, yaw: 0, pitch: -9.167 });
    window.__viewer.walkFor(0.3, { forward: 0 });
  });
  await page.keyboard.press('Backquote');
  // Controlled diagnostic inputs only; no production flash timing or strength is changed.
  for (const c of [
    { name: 'normal', wash: false, passes: 0 },
    { name: 'wash-only', wash: true, passes: 0 },
    { name: 'glow-only', wash: false, passes: 3 },
    { name: 'wash-plus-one-pass', wash: true, passes: 1 },
    { name: 'wash-plus-two-passes', wash: true, passes: 2 },
    { name: 'wash-plus-three-passes', wash: true, passes: 3 },
  ]) {
    await page.evaluate(async ({ wash, passes }) => {
      const flashPath = '/src/flash.ts', colourPath = '/src/trueColourScale.ts';
      const flash = await import(/* @vite-ignore */ flashPath);
      const colour = await import(/* @vite-ignore */ colourPath);
      flash.WhiteOut.prototype.glow = () => ({ passes, fix: passes ? 255 : 0 });
      colour.setTrueColourScale(wash ? flash.blindWash(3, 1) : null);
    }, c);
    await page.waitForTimeout(500);
    await page.locator('#view').screenshot({ path: info.outputPath(`${c.name}.png`) });
  }
});
