import { expect, test, type Page } from '@playwright/test';
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';

/**
 * VIBRATION in the test room (B137, the owner's report 2026-10-23: "vibration doesn't appear to work in the testroom"):
 * a shot's motors (`FUN_005c3360`, CTL-2) reach the pad's actuator (RUMBLE_OUTPUT_ADAPTATION), in either of the browsers'
 * forms -- Chromium's `vibrationActuator` 'dual-rumble', Firefox's `hapticActuators` `pulse` -- and a pad offering neither is
 * said on the console. No seat holds a real pad: the pad here is a stub whose actuator records what the page asks of it --
 * what a real pad then does is the person's to check.
 */

const SPAWN_A: [number, number, number] = [796, 100, 614];
type Rumbled = { calls: { type: string; strongMagnitude?: number; weakMagnitude?: number; duration?: number; value?: number }[]; resets: number };
declare global { interface Window { __rumbled: Rumbled } }

const settle = (page: Page, frames = 2): Promise<void> => page.evaluate((n) => new Promise<void>((done) => {
  let left = n;
  const step = (): void => { if (--left <= 0) done(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), frames);

/** The test room on Frostfire, walking, with a stubbed pad of the shape named: Chromium's or Firefox's. */
async function room(page: Page, shape: 'vibrationActuator' | 'hapticActuators' | 'none'): Promise<void> {
  await page.addInitScript((form) => {
    window.__rumbled = { calls: [], resets: 0 };
    const actuator = form === 'none' ? null : form === 'vibrationActuator'
      ? {
        type: 'dual-rumble', effects: ['dual-rumble'],
        playEffect: (type: string, p: Record<string, number>) => { window.__rumbled.calls.push({ type, ...p }); return Promise.resolve('complete'); },
        reset: () => { window.__rumbled.resets++; return Promise.resolve('complete'); },
      }
      : { type: 'vibration', pulse: (value: number, duration: number) => { window.__rumbled.calls.push({ type: 'pulse', value, duration }); return Promise.resolve(true); } };
    const pad = {
      id: 'Simulated rumble controller', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      ...(form === 'vibrationActuator' ? { vibrationActuator: actuator } : form === 'hapticActuators' ? { hapticActuators: [actuator] } : {}),
    };
    Object.defineProperty(Navigator.prototype, 'getGamepads', { value: () => [pad, null, null, null], configurable: true });
  }, shape);
  await page.goto(`${TEST_ROOM}?mode=play&fly&devmode&kit=62,15,121,126,255`);
  const status = page.locator('#status');
  await expect(status).toContainText('triangles');
  await page.locator('#maps').selectOption('RUN/MP2.ZDB');
  await expect(status).toContainText('FROSTFIRE (MP2)');
  await expect(status).toContainText('triangles');
  expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
  await page.evaluate(([x, y, z]) => window.__viewer.setCamera({ x, y: y + 15.4, z, yaw: 0, pitch: 0 }), SPAWN_A);
  await settle(page, 240);
}

async function burst(page: Page): Promise<{ shots: number; rumbled: Rumbled }> {
  const before = await page.evaluate(() => window.__viewer.fire().shots);
  await page.evaluate(() => { window.__rumbled.calls.length = 0; window.__viewer.trigger(true); });
  await page.waitForTimeout(450);
  await page.evaluate(() => window.__viewer.trigger(false));
  await settle(page, 30);
  return page.evaluate((b) => ({ shots: window.__viewer.fire().shots - b, rumbled: window.__rumbled }), before);
}

for (const shape of ['vibrationActuator', 'hapticActuators'] as const) {
  test(`VIBRATION ON: a shot in the test room plays the pad's rumble (${shape})`, async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(e.message));
    await room(page, shape);
    const { shots, rumbled } = await burst(page);
    console.log(JSON.stringify({ shape, shots, calls: rumbled.calls.slice(0, 6), n: rumbled.calls.length, resets: rumbled.resets }));
    expect(shots).toBeGreaterThan(0);
    expect(rumbled.calls.length, 'the actuator was asked to rumble').toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });
}

test('a pad offering no rumble: the shot fires, nothing throws, and the console says the pad cannot vibrate', async ({ page }) => {
  const problems: string[] = [], notes: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.text().startsWith('VIBRATION:')) notes.push(m.text()); });
  await room(page, 'none');
  const { shots } = await burst(page);
  expect(shots).toBeGreaterThan(0);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toContain('Simulated rumble controller');
  expect(problems).toEqual([]);
});
