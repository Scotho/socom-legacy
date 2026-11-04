import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';
import { censusByMap, type TurretCensusRow } from '../test/turretCensus';
import { TURRET_HOLD_CLIP } from '../src/net/emplacement';

/**
 * The browser half of `test/turretMapCheck.test.ts`. For every turret map whose archive is in the served tree
 * (`public/maps`, `npm run extract-maps`), the offline room on `/testroom`: the placement matches the census
 * (research 215 section 2), X mounts and dismounts, the look is held to the placement's limits, one trigger spends
 * one round, and the page reports no error. A map with no archive is skipped. Damage to a second player and the
 * second client's copy of the turret are the room test's -- this page is the loopback room's only client.
 */

const MAPS = resolve(fileURLToPath(new URL('../../../public/maps', import.meta.url)));
/**
 * Mounted screenshots. `S2U_TURRET_SHOTS` is the directory; the default is `test-results/turret-shots` under the run's
 * directory (git-ignored), never a path outside the repository. A machine that cannot create the directory still runs
 * the turret check -- the picture is evidence, not the check.
 */
const SHOTS = process.env.S2U_TURRET_SHOTS ?? 'test-results/turret-shots';
const BEHIND = 12;


/** The shorter signed turn from `a` to `b`, degrees. */
const turn = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;

/**
 * Polls `pred` until it is true. A miss returns false and does not fail the test: the caller soft-asserts once, so one
 * gun's timeout does not skip the guns after it. This is a poll against the page, not a fixed wait.
 */
async function until(page: Page, pred: () => Promise<boolean>, timeout: number): Promise<boolean> {
  try {
    await expect.poll(pred, { timeout }).toBe(true);
    return true;
  } catch (e) {
    if (e instanceof Error && /Timeout|timed out/i.test(e.message)) return false;
    throw e;
  }
}

/** The picture, when the directory can be created. A failure to write it is not a failed turret. */
async function saveShot(page: Page, name: string): Promise<void> {
  try { mkdirSync(SHOTS, { recursive: true }); } catch { return; }
  await page.screenshot({ path: join(SHOTS, name) }).catch(() => undefined);
}

async function oneTurret(page: Page, row: TurretCensusRow, problems: string[]): Promise<void> {
  const mark = problems.length;
  const root = `worldmodel/${row.name}`;
  try {
    const placed = await page.evaluate(() => window.__viewer.turrets!().placements);
    const t = placed.find((p) => p.root === root);
    expect.soft(t, `${root} placed`).toBeTruthy();
    if (!t) return;
    for (let i = 0; i < 3; i++) expect.soft(t.origin[i], `${row.name} origin`).toBeCloseTo(row.origin[i]!, 2);
    expect.soft(t.limitsDeg.yaw, `${row.name} yaw`).not.toBeNull();
    expect.soft(t.limitsDeg.pitch, `${row.name} pitch`).not.toBeNull();
    if (t.limitsDeg.yaw && t.limitsDeg.pitch) {
      expect.soft(t.limitsDeg.yaw[0]).toBeCloseTo(row.yaw[0], 2);
      expect.soft(t.limitsDeg.yaw[1]).toBeCloseTo(row.yaw[1], 2);
      expect.soft(t.limitsDeg.pitch[0]).toBeCloseTo(row.pitch[0], 2);
      expect.soft(t.limitsDeg.pitch[1]).toBeCloseTo(row.pitch[1], 2);
    }
    expect.soft(t.weapon).toBe(row.weapon);
    expect.soft(t.ammoInit).toBe(row.ammo);
    expect.soft(t.mountRange).toBe(row.range);

    const f = (t.facing * Math.PI) / 180;
    const stand: [number, number, number, number] = [t.origin[0] + BEHIND * Math.sin(f), t.origin[1], t.origin[2] + BEHIND * Math.cos(f), t.facing];
    expect.soft(await page.evaluate(([x, y, z, yaw]) => window.__viewer.teleport!(x, y, z, yaw), stand), `${row.name} teleports`).toBe(true);
    // The first X after a teleport is dropped while the game's own feet are still the previous ones. Poll the feet;
    // do not sleep for them.
    await page.evaluate(() => {
      const w = window as unknown as { __standN?: number; __standY?: number };
      w.__standN = 0;
      delete w.__standY;
    });
    const stood = await until(page, () => page.evaluate(([x, z]) => {
      const feet = window.__viewer.feet();
      const w = window as unknown as { __standN?: number; __standY?: number };
      if (!feet) return false;
      const dy = w.__standY === undefined ? 999 : Math.abs(feet[1] - w.__standY);
      w.__standY = feet[1];
      const near = Math.hypot(feet[0] - x, feet[2] - z) < 4;
      w.__standN = near && dy < 0.35 ? (w.__standN ?? 0) + 1 : 0;
      return (w.__standN ?? 0) >= 2;
    }, [stand[0], stand[2]] as const), 8_000);
    expect.soft(stood, `${row.name} feet are at the stand before X`).toBe(true);

    await expect.soft.poll(() => page.evaluate(() => window.__viewer.turrets!().target), { timeout: 8_000, message: `${row.name} in reach` }).toBe(t.id);
    await page.keyboard.press('KeyX');
    let mounted = await until(page, () => page.evaluate((id) => window.__viewer.turrets!().held === id, t.id), 2_500);
    if (!mounted) {
      await page.keyboard.press('KeyX');
      mounted = await until(page, () => page.evaluate((id) => window.__viewer.turrets!().held === id, t.id), 8_000);
    }
    expect.soft(mounted, `${row.name} mounts on X`).toBe(true);
    if (!mounted) return;

    await expect.soft.poll(() => page.evaluate(() => window.__viewer.hud().model.action), { timeout: 10_000, message: `${row.name} dismount prompt` }).toBe('turret_dismount');
    await saveShot(page, `${row.map}-${row.name.trim()}.png`);
    // The mount clip lays the yaw on the gun's facing at its end (PB-2, `turretPage.ts`): aim only once the hold has begun, as
    // `turretMount.spec.ts` does -- a camera set inside the clip is laid back (the 35 seen on MP73, the merge controller's run).
    await expect.soft.poll(async () => (await page.evaluate(() => window.__viewer.ownBody())).clip, { timeout: 10_000, message: `${row.name} the hold begun` }).toBe(TURRET_HOLD_CLIP);

    await page.evaluate(([yaw, pitch]) => window.__viewer.setCamera({ yaw, pitch }), [t.facing + row.yaw[1] + 40, row.pitch[1] + 30] as const);
    await expect.soft.poll(async () => {
      const pose = await page.evaluate(() => window.__viewer.pose());
      return Math.max(Math.abs(turn(t.facing, pose.yaw) - row.yaw[1]), Math.abs(pose.pitch - row.pitch[1]));
    }, { timeout: 8_000, message: `${row.name} aim returns to its limits` }).toBeLessThan(1.5);

    const before = await page.evaluate((id) => window.__viewer.turrets!().turrets.find((w) => w.id === id)?.ammo ?? null, t.id);
    expect.soft(before, `${row.name} ammo before the pull`).toBe(row.ammo);
    // One page frame, pressed and let go inside the page (no round trips between): PKM and LMG are automatic (a round each
    // 96 ms held) and a headless frame can be 100 ms or more, so a pull held across round trips fires twice (`turretMgl.spec.ts`'s
    // pull; the page's frame runs before this callback in the same vsync).
    const pull = (): Promise<void> => page.evaluate(() => new Promise<void>((done) => {
      window.__viewer.trigger(true);
      requestAnimationFrame(() => { window.__viewer.trigger(false); done(); });
    }));
    const ammo = (): Promise<number | null> => page.evaluate((id) => window.__viewer.turrets!().turrets.find((w) => w.id === id)?.ammo ?? null, t.id);
    // LATER 180 (research 215 s8.3-8.4): the spec following the original's raise wait. A just-mounted PKM or LMG reads its
    // raise at 0 (the turret's zero raise times), so its first one-frame pull is the latch's frame: no round, and the
    // pending bit set (`FUN_005c0ae0` D:L476423-476429). The bit survives the let-go (D:L476381-476416), so the next
    // one-frame pull fires on its press -- one round, whatever the headless frame's length. The MGL has no latch (class 230).
    // Was: one pull, one round (and, before the latch was ported, no latch tap).
    if (row.weapon !== 'MGL FRAG TURRET') {
      await pull();
      await page.waitForTimeout(400);
      expect.soft(await ammo(), `${row.name} the latch's pull spends nothing`).toBe(before);
    }
    await pull();
    await expect.soft.poll(ammo, { timeout: 5_000, message: `${row.name} spends one round` }).toBe((before ?? 0) - 1);

    await page.keyboard.press('KeyX');
    await expect.soft.poll(() => page.evaluate(() => window.__viewer.turrets!().held), { timeout: 10_000, message: `${row.name} dismounts` }).toBeNull();
  } finally {
    // The next teleport waits until this gun is released and the body has stopped. A release still in its steer, or a
    // target left over from the previous feet, is what made the next gun report no target (or the previous gun's id).
    try {
      const held = await page.evaluate(() => window.__viewer.turrets?.().held ?? null);
      if (held !== null) {
        await page.keyboard.press('KeyX');
        await until(page, () => page.evaluate(() => window.__viewer.turrets!().held === null), 8_000);
      }
      await page.evaluate(() => {
        const w = window as unknown as { __clearN?: number; __clearFeet?: [number, number, number] };
        w.__clearN = 0;
        delete w.__clearFeet;
      });
      const clear = await until(page, () => page.evaluate(() => {
        const feet = window.__viewer.feet();
        const tur = window.__viewer.turrets?.();
        const w = window as unknown as { __clearN?: number; __clearFeet?: [number, number, number] };
        if (!feet || !tur) return false;
        const prev = w.__clearFeet;
        w.__clearFeet = [feet[0], feet[1], feet[2]];
        const moved = prev ? Math.hypot(feet[0] - prev[0], feet[1] - prev[1], feet[2] - prev[2]) : 999;
        w.__clearN = moved < 0.35 ? (w.__clearN ?? 0) + 1 : 0;
        return tur.held === null && tur.prompt !== 'turret_dismount' && (w.__clearN ?? 0) >= 2;
      }), 10_000);
      expect.soft(clear, `${row.name} settled and the mount cleared before the next gun`).toBe(true);
    } catch { /* the page is already gone; the soft checks above name the gun */ }
    expect.soft(problems.slice(mark), `${row.name} console`).toEqual([]);
  }
}

for (const group of censusByMap()) {
  test(`${group.map} ${group.title}: every turret spawns, mounts, aims, fires and dismounts`, async ({ page }) => {
    test.skip(!existsSync(join(MAPS, 'RUN', `${group.map}.ZDB`)), `needs socomlegacy/public/maps/RUN/${group.map}.ZDB (npm run extract-maps)`);
    test.setTimeout(120_000 + group.rows.length * 90_000);
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

    await page.goto(`${TEST_ROOM}?map=${group.map}&mode=play&devmode&noarmory`);
    await expect(page.locator('#status')).toContainText(`(${group.map})`, { timeout: 120_000 });
    await expect.poll(() => page.evaluate(() => window.__viewer.net?.()?.state ?? null), { timeout: 60_000 }).toBe('open');
    await expect.poll(() => page.evaluate(() => window.__viewer.net?.()?.waiting ?? null), { timeout: 60_000 }).toBe(false);
    await holdReleased(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect.soft(await page.evaluate(() => window.__viewer.turrets!().placements.map((p) => p.name)), `${group.map} placement order`).toEqual(group.rows.map((r) => r.name));
    expect.soft(problems, `${group.map} console before the guns`).toEqual([]);

    for (const row of group.rows) await oneTurret(page, row, problems);
  });
}
