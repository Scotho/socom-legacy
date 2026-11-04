import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { gunDelta, TURRET_HELD_WEAPON_READING, TURRET_HOLD_CLIP } from '../src/net/emplacement';
import { turretHoldKey } from '../src/turretPage';
import { MAX_PITCH_RATE, MAX_YAW_RATE, PITCH_RETURN } from '../src/look';
import { TICK } from '../src/mover';
import { LOOK_SLACK_TICKS_PLACEHOLDER } from '../src/net/lookGate';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * W0-gate (web sprint 31; research 237 §0): the in-browser mount-and-aim check sprint 27 owed (the three-maps plan's
 * Log 2026-10-06 ~01:00; research 213: the test room cannot walk to a turret). In the page's own match on Vigilance
 * (MP51; the offline room, `../src/net/loopback`, as `soloMatch.spec.ts` plays it), the walker is stood behind
 * `mp51_turret01` by the dev-only `__viewer.teleport` (the page's mover and the room's), the action button (X) is
 * pressed, and:
 * - the mount: the room's word (`TurretPage.mounted`), the HUD's turret page -- the action prompt
 *   `turret_dismount` (`action_dismount_turret.tif`) and the weapon box the kit's holding the turret's weapon (PAR-55,
 *   `TURRET_AMMO_HUD_READING`, research 215 s8: PKM TURRET's 750 in magazines of 250 -- 250/250, 2 MAGS -- its
 *   `turret_rmg.tif`, AUTO) -- and, once the mount's steer has set the body
 *   on its seat (`SeatSteer`, research 215 s7), the walk held (`WalkMode.setLocked`);
 * - the aim: turned past each stop the look comes back to the placement's limits (`clampAim`; MP51's `mp51_turret`
 *   record: yaw -70..70, pitch -45..45, research 215 s3), within them it is kept, and the drawn gun is turned about its
 *   pivot to the held aim (`gunDelta`, `WorldView.moveNode` on `parts.gun`);
 * - the dismount: X again frees it and gives the walk back.
 *
 * PB-2 (PB.R2's golden, `window.__viewer.ownBody()`, a development instrument): in the hold the own body has its rifle on
 * its carry, stowed at the mount clip's phase 0.5 (`TURRET_HELD_WEAPON_READING` 'carry': `FUN_00588bc0` -> `FUN_005a73c0`,
 * PB-2b's rework, research 215 s7.3; was 'hand', PB-2b) -- no muzzle drawn in the hand -- and holds `seal_turret_poses` at the key the gun's
 * elevation picks (`turretHoldKey`, `FUN_00585cd0`; s7.4) at each aim.
 *
 * What is not built is not asserted: the camera does not move to the gun's pivot (no mounted camera was read, owed
 * capture B 13; the mount pose is drawn since research 215 s7); the walk's camera stays on the held body, within the
 * mount's reach of the pivot -- that is what is checked.
 */

const MAPS = resolve(fileURLToPath(new URL('../../../public/maps', import.meta.url)));
const HAVE = existsSync(join(MAPS, 'RUN', 'MP51.ZDB'));

/** Research 215 s3's table: `mp51_turret01`, id 0, PKM TURRET, 750 rounds, yaw -70..70, pitch -45..45, range 22. */
const ROOT = 'worldmodel/mp51_turret01';
const ORIGIN = [1237.637, 89.061, 948.578] as const;
const LIMITS = { yaw: [-70, 70], pitch: [-45, 45] } as const;
const AMMO = 750;
/** PAR-55 (research 215 s8): PKM TURRET's `Ammo_Capacity`, the magazines the mount pours its 750 into. */
const MAG = 250;
/** Where the walker is stood: on the gun's line, this far behind its pivot (inside the reach of 22). */
const BEHIND = 12;

/**
 * T81-2 (research 215 s7.8): the own gun is drawn at the aim the hold placed the body at -- the mover's, which the look gate
 * (`../src/net/lookGate`, the stick's law) lets reach a jumped look over ticks. The ticks a turn of `d` degrees takes past
 * the gate's banked slack: the yaw at `MAX_YAW_RATE`, the pitch at `MAX_PITCH_RATE` + `PITCH_RETURN` (the weapon's kick
 * left out, so never fewer ticks than the room's gate takes).
 */
const gateTicks = (d: number, rate: number): number => Math.max(0, Math.ceil(Math.abs(d) / ((rate * TICK * 180) / Math.PI)) - LOOK_SLACK_TICKS_PLACEHOLDER);
/** A test tolerance (headless frame scheduling: the page's frames and ticks against the wall clock), no game value. */
const E2E_FRAME_SLACK_MS = 1000;

const frames = (page: Page, n: number): Promise<void> => page.evaluate((count) => new Promise<void>((done) => {
  let left = count;
  const step = (): void => { if (--left <= 0) done(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), n);

/** The shorter signed turn from `a` to `b`, degrees. */
const turn = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;


test('MP51: teleported behind mp51_turret01, X mounts it -- the HUD turret page, the walk held -- the aim is held to its limits and the drawn gun follows, X dismounts', async ({ page }) => {
  test.skip(!HAVE, 'needs socomlegacy/public/maps/RUN/MP51.ZDB (tools/extract-maps.ts)');
  test.setTimeout(240_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  // Dev only: without `?devmode` the hook has no teleport.
  await page.goto(`${TEST_ROOM}?mode=play`);
  await page.waitForFunction(() => '__viewer' in window);
  expect(await page.evaluate(() => typeof window.__viewer.teleport)).toBe('undefined');

  await page.goto(`${TEST_ROOM}?map=MP51&mode=play&devmode&noarmory`);
  await expect(page.locator('#status')).toContainText('VIGILANCE (MP51)', { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => window.__viewer.net?.()?.state ?? null), { timeout: 60_000 }).toBe('open');
  await expect.poll(() => page.evaluate(() => window.__viewer.feet()), { timeout: 60_000 }).not.toBeNull();
  await holdReleased(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await page.evaluate(() => typeof window.__viewer.teleport)).toBe('function');   // `?devmode`: the hook is there

  const { placements } = await page.evaluate(() => window.__viewer.turrets!());
  const t = placements.find((p) => p.root === ROOT)!;
  expect(t, `${ROOT} placed`).toBeTruthy();
  for (let a = 0; a < 3; a++) expect(t.origin[a]).toBeCloseTo(ORIGIN[a]!, 2);
  expect(t.limitsDeg.yaw![0]).toBeCloseTo(LIMITS.yaw[0], 3);
  expect(t.limitsDeg.yaw![1]).toBeCloseTo(LIMITS.yaw[1], 3);
  expect(t.limitsDeg.pitch![0]).toBeCloseTo(LIMITS.pitch[0], 3);
  expect(t.limitsDeg.pitch![1]).toBeCloseTo(LIMITS.pitch[1], 3);
  expect(t.ammoInit).toBe(AMMO);

  // Out of reach where the match stood it: no prompt for this turret.
  expect((await page.evaluate(() => window.__viewer.turrets!())).target).not.toBe(t.id);

  // Stood behind it on its line, facing its way (`canMount`: within 22 and within the mount angle of its facing).
  const f = (t.facing * Math.PI) / 180;                              // the gun's line is (-sin f, 0, -cos f)
  const stand: [number, number, number] = [t.origin[0] + BEHIND * Math.sin(f), t.origin[1], t.origin[2] + BEHIND * Math.cos(f)];
  // After the round's start: the classic room's launch countdown ends in the round's spawn (`room.ts` `spawn`), which
  // would stand the walker back at its slot (`net().waiting` true until then).
  await expect.poll(() => page.evaluate(() => window.__viewer.net?.()?.waiting ?? null), { timeout: 60_000 }).toBe(false);
  expect(await page.evaluate(([x, y, z, yaw]) => window.__viewer.teleport!(x, y, z, yaw), [...stand, t.facing] as const)).toBe(true);
  await frames(page, 10);
  const feet = (await page.evaluate(() => window.__viewer.feet()))!;
  expect(Math.hypot(feet[0] - stand[0], feet[2] - stand[2])).toBeLessThan(1);
  expect(Math.hypot(feet[0] - t.origin[0], feet[1] - t.origin[1], feet[2] - t.origin[2])).toBeLessThanOrEqual(t.mountRange);
  await expect.poll(() => page.evaluate(() => window.__viewer.turrets!().target), { timeout: 10_000 }).toBe(t.id);
  await expect.poll(() => page.evaluate(() => window.__viewer.hud().model.action), { timeout: 10_000 }).toBe('turret_mount');

  // The gun at rest, for its turn later.
  const gunAt = (): Promise<{ path: string; matrix: number[] }[]> =>
    page.evaluate((gun) => window.__viewer.turretParts!().filter((p) => p.path === gun || p.path.startsWith(`${gun}/`)).map((p) => ({ path: p.path, matrix: p.matrix })), t.parts.gun);
  const rest = await gunAt();
  expect(rest.length).toBeGreaterThan(0);
  // PB-2b: before the mount the rifle is in the hands -- its muzzle drawn (`ownBody().muzzle`, `Play.muzzle`).
  const own = () => page.evaluate(() => window.__viewer.ownBody());
  expect((await own()).muzzle, 'the rifle drawn in the hands before the mount').not.toBeNull();

  // X: the mount, asked of the room and answered.
  await page.keyboard.press('KeyX');
  await expect.poll(() => page.evaluate(() => window.__viewer.turrets!().held), { timeout: 10_000 }).toBe(t.id);
  // The HUD's model is written on the frame after the room's answer.
  await expect.poll(() => page.evaluate(() => window.__viewer.hud().model.action), { timeout: 10_000 }).toBe('turret_dismount');
  const hud = (await page.evaluate(() => window.__viewer.hud())).model;
  expect([hud.rounds, hud.capacity, hud.spare, hud.weaponIcon, hud.fireMode]).toEqual([MAG, MAG, 2, 'turret_rmg.tif', 'auto']);
  // The mount's steer carries the body toward its seat first (`SeatSteer`, TURRET_SEAT_READING: its 16 steer ticks, the hold placing
  // it on the 17th, PB-2c; research 215 s7.1); the walk held is checked once it has stopped there. Each sample at least 300 ms after the last (300 ms waited, then the poll's 250 ms interval; as
  // `menuVigilance.spec.ts`, research 250 s7 finding 8): a poll's first call is at once, and two reads inside one frame
  // read "still" while the steer runs -- issue #93: from 12 behind the clip's root carries the feet ~2 u toward the gun and
  // back, so a hold begun mid-steer measured the steer's path (1.02 on main), not the stick (`test/turretHold.test.ts`).
  // T81-3 (research 215 s7.9): the page's mover is placed on the hold's place on the hold's first tick (the clip's end,
  // `seal_turret_poses` drawn), about 3 u from where the reconcile had carried it through the mount clip -- the feet read
  // still between two reads inside the clip, so the hold is waited for first (the seat's diagnostic, 2026-10-17: 5.63).
  await expect.poll(async () => (await own()).clip, { timeout: 10_000, message: 'the hold begun' }).toBe(TURRET_HOLD_CLIP);
  let last = (await page.evaluate(() => window.__viewer.feet()))!;
  await expect.poll(async () => {
    await page.waitForTimeout(300);
    const now = (await page.evaluate(() => window.__viewer.feet()))!;
    const moved = Math.hypot(now[0] - last[0], now[2] - last[2]);
    last = now;
    return moved;
  }, { timeout: 10_000, intervals: [250] }).toBeLessThan(0.01);
  // The walk held: the stick moves nothing.
  const before = (await page.evaluate(() => window.__viewer.feet()))!;
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  const after = (await page.evaluate(() => window.__viewer.feet()))!;
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeLessThan(0.5);
  // PB-2 (a), PB-2b's rework: in the hold the rifle is on its carry and no muzzle is drawn in the hand (`Play.muzzle`
  // answers null off the hand) -- read only while the hold's clip plays, so the poll cannot pass before the mount. Was
  // (PB-2b F5): the muzzle more than HOLD_MUZZLE_MOVE (3) off the pre-mount one, in the body's frame.
  await expect.poll(async () => { const o = await own(); return o.clip === TURRET_HOLD_CLIP ? { rifle: o.mounts.rifle, muzzle: o.muzzle } : null; },
    { timeout: 10_000, message: 'the rifle in the hold' }).toEqual({ rifle: TURRET_HELD_WEAPON_READING, muzzle: null });
  // The camera: on the held body, within the mount's reach of the pivot (the pivot's own camera is not built).
  const cam = (await page.evaluate(() => window.__viewer.camera()))!;
  expect(Math.hypot(cam.target[0] - t.gunOrigin[0], cam.target[2] - t.gunOrigin[2])).toBeLessThanOrEqual(t.mountRange);

  // The aim: past each stop it comes back to the limit; within them it is kept; the drawn gun follows the held aim.
  const aimAfter = async (yaw: number, pitch: number): Promise<{ yaw: number; pitch: number }> => {
    await page.evaluate(([y, p]) => window.__viewer.setCamera({ yaw: y, pitch: p }), [yaw, pitch] as const);
    await frames(page, 4);
    const pose = await page.evaluate(() => window.__viewer.pose());
    return { yaw: turn(t.facing, pose.yaw), pitch: pose.pitch };
  };
  // The aim before each jump, from the facing: the first from the look read before them (the hold settled on it since the
  // mount -- the gun's facing and the look's pitch, the walk's spawn pitch -9.167 unless turned: `playerCamera.ts`).
  const seed = await page.evaluate(() => window.__viewer.pose());
  let was = { yaw: turn(t.facing, seed.yaw), pitch: seed.pitch };
  for (const [rel, pitch, want] of [
    [120, 60, { yaw: LIMITS.yaw[1], pitch: LIMITS.pitch[1] }],
    [-120, -60, { yaw: LIMITS.yaw[0], pitch: LIMITS.pitch[0] }],
    [30, 10, { yaw: 30, pitch: 10 }],
  ] as const) {
    const got = await aimAfter(t.facing + rel, pitch);
    expect(got.yaw, `yaw ${rel} from the facing`).toBeCloseTo(want.yaw, 1);
    expect(got.pitch, `pitch ${pitch}`).toBeCloseTo(want.pitch, 1);
    const delta = gunDelta(t, t.facing + want.yaw, want.pitch);
    // The drawn matrix is the turn after the placement's own: delta x rest (column-major 4x4s).
    const expectedOf = (r: { matrix: number[] }): number[] => Array.from({ length: 16 }, (_, k) => {
      const c = Math.floor(k / 4), row = k % 4;
      let s = 0;
      for (let m = 0; m < 4; m++) s += delta[m * 4 + row]! * r.matrix[c * 4 + m]!;
      return s;
    });
    // T81-2: the gun reaches the held aim as the gate lets the mover's aim reach it -- a bounded poll on the drawn matrices.
    const ticks = Math.max(gateTicks(want.yaw - was.yaw, MAX_YAW_RATE), gateTicks(want.pitch - was.pitch, MAX_PITCH_RATE + PITCH_RETURN));
    await expect.poll(async () => {
      const now = await gunAt();
      let worst = 0;
      for (const [i, r] of rest.entries()) {
        const e = expectedOf(r);
        for (let k = 0; k < 16; k++) worst = Math.max(worst, Math.abs(now[i]!.matrix[k]! - e[k]!));
      }
      return worst;
    }, { timeout: ticks * TICK * 1000 + E2E_FRAME_SLACK_MS, intervals: [50], message: `the drawn gun reaches yaw ${want.yaw}, pitch ${want.pitch} (${ticks} gate ticks)` })
      .toBeLessThan(0.005);
    was = want;
    // PB-2 (c): the own body holds seal_turret_poses at the key the gun's elevation picks.
    await expect.poll(async () => { const o = await own(); return o.clip === TURRET_HOLD_CLIP ? o.frame : null; }, { timeout: 10_000, message: `the hold's key at pitch ${want.pitch}` })
      .toBeCloseTo(turretHoldKey(want.pitch), 1);
    const now = await gunAt();
    for (const [i, r] of rest.entries()) {
      const expected = expectedOf(r);
      for (let k = 0; k < 16; k++) expect(now[i]!.matrix[k]!, `${now[i]!.path} [${k}] at yaw ${want.yaw}, pitch ${want.pitch}`).toBeCloseTo(expected[k]!, 2);
    }
  }

  // X again: the dismount, the walk back.
  await page.keyboard.press('KeyX');
  await expect.poll(() => page.evaluate(() => window.__viewer.turrets!().held), { timeout: 10_000 }).toBeNull();
  await expect.poll(() => page.evaluate(() => window.__viewer.hud().model.action), { timeout: 10_000 }).not.toBe('turret_dismount');
  expect(problems).toEqual([]);
});
