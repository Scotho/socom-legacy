import { expect, test, type Page } from '@playwright/test';
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

// Browser test adaptation: floor/ray-checked cameras at authored barriers. Use real planting and fuse;
// observe visibility on all nine access-barrier maps, and physical blocked/open traversal on Vigilance.
const cases: { map: string; target: string; pose: [number, number, number, number, number] }[] = [
  { map: 'MP11', target: 'access1/gate_move1/access_topgate=access_topgate/good_parts/gate/di_good', pose: [1129.407745,-84.6,460.611031,90,31.541757] },
  { map: 'MP11', target: 'access2/gate_move2/access_topgate=access_topgate/good_parts/gate/di_good', pose: [1695.5,-4.6,272.625,81.8756103515625,-12.39] },
  { map: 'MP51', target: 'access1=access1/good_parts/di_good', pose: [1493.095520,63.4,1036.599976,180,-18.693225] },
  { map: 'MP6', target: 'access1/good_parts/di_good', pose: [1641.658081,65.4,1275,0,9.926246] },
  { map: 'MP61', target: 'access1/access1=access1/good_parts/di_good', pose: [674.041992,55.143054,1021.076172,180,2.490951] },
  { map: 'MP62', target: 'access1/gate_move1/access_point=access_point/good_parts/di_good', pose: [2163.953369,225.276906,1439.350952,-90,-3.035030] },
  { map: 'MP71', target: 'access1/access_fencegate=access_fencegate/good_parts/di_good', pose: [1938,154.461264,1155.200806,180,-13.585991] },
  { map: 'MP73', target: 'access2/access_point=access_point/good_parts/di_good', pose: [839.528900,70.181396,1676.239563,180,-16.690561] },
  { map: 'MP82', target: 'access1/access1=access1/good_parts/di_good', pose: [435.000015,-24.600008,465.500015,180,0.701205] },
  { map: 'MP83', target: 'access1/access_topgate=access_topgate/good_parts/di_good', pose: [1497.204895,97.400842,1581.436401,180,-18.746465] },
];
// Follow-up regression: Fish Hook also plants above/below the original reticle point; Death Trap covers both gates.
// These camera deltas are browser-test instruments, not gameplay tuning.
const placements = cases.flatMap(c => [
  { ...c, variant: 'centre' },
  ...(['MP71'].includes(c.map) ? [-5, 5].map(delta => ({
    ...c, variant: `pitch ${delta}`, pose: [...c.pose.slice(0, 4), c.pose[4] + delta] as typeof c.pose,
  })) : []),
]);
for (const c of placements) test(`offline C4 opens ${c.map} ${c.variant} ${c.target}`, async ({ page }, testInfo) => {
  const problems: string[] = [];
  page.on('pageerror', e => problems.push(e.message));
  await page.goto(`${TEST_ROOM}?mode=play&fly&devmode&kit=62,15,151,121,255`);
  await expect(page.locator('#status')).toContainText('triangles');
  await page.locator('#maps').selectOption(`RUN/${c.map}.ZDB`);
  await expect(page.locator('#status')).toContainText(`(${c.map})`);
  await holdReleased(page);
  // Browser instrument: the development figures panel overlaps the original HUD area.
  const figures = page.getByRole('button', { name: 'Hide figures', exact: true });
  if (await figures.isVisible()) await figures.click();
  const path = `worldmodel/${c.target}`;
  expect(await page.evaluate(p => window.__viewer.worldActive(p), path)).toBe(true);
  const stand = async () => {
    expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
    if ((c.map === 'MP11' && c.target.startsWith('access1/')) || c.map === 'MP82') await page.evaluate(() => { if (window.__viewer.zoom().state === 0) window.__viewer.zoomIn(); });
    await page.evaluate(([x, y, z, yaw, pitch]) => window.__viewer.setCamera({ x, y, z, yaw, pitch }), c.pose);
    await page.evaluate(() => window.__viewer.walkFor(0.3, { forward: 0 }));
  };
  await stand();
  if (c.map === 'MP51') {
    await page.evaluate(() => window.__viewer.walkFor(0.7, { forward: 1 }));
    expect((await page.evaluate(() => window.__viewer.feet()))![2]).toBeLessThan(1049.2);
  }
  await stand();
  const before = await page.evaluate(() => ({ feet: window.__viewer.feet(), ammo: window.__viewer.grenade().leftByItem.C4 }));
  await page.locator('#view').screenshot({ path: testInfo.outputPath('intact.png') });
  expect(await page.evaluate(() => window.__viewer.hud().model.c4FuseBar ?? null)).toBeNull();
  await expect.poll(() => page.evaluate(() => window.__viewer.plantC4()), { timeout: 10000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__viewer.hud().model.c4FuseBar?.fill ?? 0)).toBeGreaterThan(0.7);
  const full = await page.evaluate(() => window.__viewer.hud().model.c4FuseBar!.fill);
  expect(await page.evaluate(() => window.__viewer.hud().rects.c4FuseBar)).toBeTruthy();
  await page.locator('#view').screenshot({ path: testInfo.outputPath('countdown-full.png') });
  await expect.poll(() => page.evaluate(() => window.__viewer.hud().model.c4FuseBar?.fill ?? 1)).toBeLessThan(0.6);
  const partial = await page.evaluate(() => window.__viewer.hud().model.c4FuseBar!.fill);
  expect(partial).toBeGreaterThan(0);
  expect(partial).toBeLessThan(full);
  await page.locator('#view').screenshot({ path: testInfo.outputPath('countdown.png') });
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().explosions.filter(e => e.item === 'C4').length), { timeout: 20000 }).toBe(1);
  await expect.poll(() => page.evaluate(p => window.__viewer.worldActive(p), path)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__viewer.hud().model.c4FuseBar ?? null)).toBeNull();
  const after = await page.evaluate(() => window.__viewer.grenade());
  expect(after.leftByItem.C4).toBe(before.ammo! - 1);
  await testInfo.attach('single-charge-breach', { body: JSON.stringify({ map: c.map, variant: c.variant, before, explosion: after.explosions.find(e => e.item === 'C4'), ammoAfter: after.leftByItem.C4 }), contentType: 'application/json' });
  await page.waitForTimeout(2500); // Let the authored debris and blast smoke clear for the visual check.
  await page.locator('#view').screenshot({ path: testInfo.outputPath('breached.png') });
  await stand();
  if (c.map === 'MP51') {
    await page.evaluate(() => window.__viewer.walkFor(0.7, { forward: 1 }));
    expect((await page.evaluate(() => window.__viewer.feet()))![2]).toBeGreaterThan(1049.2);
  }
  expect(problems).toEqual([]);
});

// The offline match (no nomatch, no fly): the room's blast and the page's flash are one frame.
// Death Trap's first gate and Fish Hook's gate, the two maps the delay was seen on.
// Through the armory. `&noarmory` is a separate bug: the blast kills the planter and the gate stays up.
const matchCases = [
  cases.find(c => c.map === 'MP11' && c.target.startsWith('access1/'))!,
  cases.find(c => c.map === 'MP71')!,
];
/**
 * Short stalls across the fuse. Each is long enough that main's in-page clock (five ticks a wake, the rest
 * dropped) falls behind, and short enough that this room still catches the ticks up. On `fed5dda51` one 250 ms
 * wake keeps 5 ticks (83.3 ms) and drops 166.7 ms. Eight of them drop 1.333 s, about 40 game frames
 * (`1.333 / (525/15734)`). Main's one-second fallback then blasts while the room still has about 0.333 s left,
 * about 20 rAF frames at 60 Hz, so the gate index is not the blast index.
 */
const FUSE_STALLS = 8;
const FUSE_STALL_MS = 250;
const FRAMES_BETWEEN_STALLS = 6;

/** SEAL 1, DONE, leave. The room is made when the armory closes; `&kit=` is still the spawn pick. */
async function leaveArmory(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__viewer.armory().open), { timeout: 60_000 }).toBe(true);
  await holdReleased(page);
  // The page's key often misses this screen, so the armory stays open and the plant is refused.
  const press = async (code: string): Promise<void> => {
    await expect.poll(() => page.evaluate(() => window.__viewer.armory().taking), { timeout: 10_000 }).toBe(true);
    const took = await page.evaluate((c) => window.__viewer.armoryKey(c), code);
    if (!took) await page.keyboard.press(code);
  };
  await press('Enter');
  await expect.poll(() => page.evaluate(() => window.__viewer.armory().screen)).toBe('row');
  await press('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__viewer.armory().screen)).toBe('done');
  await press('Enter');
  await expect.poll(() => page.evaluate(() => window.__viewer.armory().open)).toBe(false);
}

for (const c of matchCases) test(`offline match C4 opens ${c.map} ${c.target} in the blast frame`, async ({ page }) => {
  test.setTimeout(180_000);
  const problems: string[] = [];
  page.on('pageerror', e => problems.push(e.message));
  await page.goto(`${TEST_ROOM}?map=${c.map}&mode=play&devmode&kit=62,15,151,121,255`);
  await expect(page.locator('#status')).toContainText(`(${c.map})`, { timeout: 120_000 });
  await leaveArmory(page);
  await expect.poll(() => page.evaluate(() => window.__viewer.net?.()?.state ?? null), { timeout: 60_000 }).toBe('open');
  await expect.poll(() => page.evaluate(() => window.__viewer.net?.()?.waiting ?? null), { timeout: 60_000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__viewer.feet()), { timeout: 30_000 }).not.toBeNull();
  const [x, y, z, yaw, pitch] = c.pose;
  // Death Trap's first gate, the same zoom the fly case uses before it plants.
  if (c.map === 'MP11' && c.target.startsWith('access1/')) await page.evaluate(() => { if (window.__viewer.zoom().state === 0) window.__viewer.zoomIn(); });
  expect(await page.evaluate(([px, py, pz, pyaw, ppitch]) => {
    const stood = window.__viewer.teleport!(px, py, pz, pyaw);
    window.__viewer.setCamera({ yaw: pyaw, pitch: ppitch });
    return stood;
  }, [x, y, z, yaw, pitch] as const)).toBe(true);
  await page.evaluate(() => window.__viewer.walkFor(0.3, { forward: 0 }));
  const path = `worldmodel/${c.target}`;
  expect(await page.evaluate(p => window.__viewer.worldActive(p), path)).toBe(true);
  const before = await page.evaluate(() => window.__viewer.grenade().leftByItem.C4);
  expect(await page.evaluate(() => window.__viewer.armory().open)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__viewer.plantC4()), { timeout: 10000 }).toBe(true);
  // The blast's rAF and the gate's rAF. Main's five-tick wake drops part of each stall, so the gate outlives the blast.
  const seen = await page.evaluate(async ({ path: p, stalls, stallMs, between }) => {
    let frame = 0;
    let blast = -1;
    let gate = -1;
    const sample = (): void => {
      frame += 1;
      if (blast < 0 && window.__viewer.grenade().explosions.some(e => e.item === 'C4')) blast = frame;
      if (gate < 0 && window.__viewer.worldActive(p) === false) gate = frame;
    };
    const raf = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => { sample(); resolve(); }));
    const busy = (ms: number): void => { const t = performance.now(); while (performance.now() - t < ms) { /* the page thread */ } };
    for (let i = 0; i < stalls; i++) {
      for (let k = 0; k < between; k++) await raf();
      busy(stallMs);
      await raf();
    }
    const deadline = frame + 900;
    while ((blast < 0 || gate < 0) && frame < deadline) await raf();
    return { blast, gate, frame };
  }, { path, stalls: FUSE_STALLS, stallMs: FUSE_STALL_MS, between: FRAMES_BETWEEN_STALLS });
  expect(seen.blast, `blast frame ${seen.blast}, gate frame ${seen.gate}`).toBeGreaterThan(0);
  // The viewer's rAF is already queued when this sample is queued, and `drain` applies the gate and `detonate`
  // before the explosion in that same viewer frame, so the two indexes are equal.
  expect(seen.gate, `blast frame ${seen.blast}, gate frame ${seen.gate}`).toBe(seen.blast);
  expect(await page.evaluate(() => window.__viewer.grenade().leftByItem.C4)).toBe(before! - 1);
  expect(problems).toEqual([]);
});
