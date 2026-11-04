import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * PAR-63 (PARITY-2; research 215 s8 and s8.1): the rendered run PAR-59 owes. In the page's own match on Blood Lake (MP10;
 * the offline room, `../src/net/loopback`, as `turretMount.spec.ts` plays MP51), the walker is stood behind
 * `mp10_turret_mgl` (MGL FRAG TURRET, id 230, class 230) by the dev-only `__viewer.teleport`, X mounts it, and:
 * - the box (PAR-55, PAR-57; research 215 s8): the mount pours its 72 into magazines of `Ammo_Capacity` 24 -- 24/24,
 *   2 MAGS -- and the icon is the record's `IconTextureName` `Turret_MGL.tif` (the HUD model's lower case), its mode
 *   SINGLE (`MaxFireMode 1`);
 * - the fire-mode row hidden for class 230 (PAR-56: `FUN_005bc300` D:L473799-473803, `fireModeRowShown`): the HUD model's
 *   `fireModeRow` false and no `firemode` quad drawn;
 * - one pull, one round (PAR-59; research 215 s8.1): the room's count of the turret drops by one (its `turretLaunch`, one
 *   shot counted) and the page flies one round of its own (`FirearmHands.launched` -> `GrenadeThrower.launchRound`):
 *   leaving the firepoint at `Muzzle_Velocity` 27 -> 270 u/s, falling at its own `Gravity_Acceleration` 3.9 -> 39 u/s^2,
 *   its fuse `Timer1` 10 s;
 * - the rate (`FireWait 1`, SINGLE: `FUN_005c09f0` D:L476323-476330, `FUN_005c0940` D:L476281-476310, `FUN_005c0ae0`
 *   D:L476439 and D:L476446): a second pull let go inside the wait launches none, a pull after it one more;
 * - no page error.
 *
 * What is not built is not asserted (research 215 s8.1, "Not built"): the round's report and flash through the M203's
 * redirect (`.M203_GREN`, `muzzle_m203` on the turret's node, D:L479422-479480). Nor is where the round lands -- its impact
 * past `ArmingDistance` 100 u and its blast of `M203 FRAG Ammo` -- read here: it depends on the ground down the gun's line,
 * unread for MP10. The room's `grenade` event goes to the other pages only (the occupant's flies its own), and the hook
 * shows no room event: the room's word here is the turret's count (`turrets().turrets`, the wire).
 */

const MAPS = resolve(fileURLToPath(new URL('../../../public/maps', import.meta.url)));
const HAVE = existsSync(join(MAPS, 'RUN', 'MP10.ZDB'));

/** Research 215 s2's census: `mp10_turret_mgl`, id 2, MGL FRAG TURRET, 72 rounds, yaw -70..70, pitch -25..10, range 22. */
const ROOT = 'worldmodel/mp10_turret_mgl';
const ID = 2;
const ORIGIN = [1427.064, 184.234, 2135.551] as const;
const LIMITS = { yaw: [-70, 70], pitch: [-25, 10] } as const;
const RANGE = 22;
const WEAPON = 'MGL FRAG TURRET';
const AMMO = 72;
/** PAR-57 (research 215 s8, the disc's `zweapon.rdr`): MGL FRAG TURRET's `Ammo_Capacity`, its icon as the HUD model holds it. */
const MAG = 24;
const ICON = 'turret_mgl.tif';
/** PAR-59 (research 215 s8.1, the disc's `zweapon.rdr`): `Muzzle_Velocity 27`, `Gravity_Acceleration 3.9`, `Timer1 10`, `FireWait 1` (x10 / s). */
const SPEED = 270;
const GRAVITY = 39;
const FUSE = 10;
const FIRE_WAIT_MS = 1000;
/** Where the walker is stood: on the gun's line, this far behind its pivot (inside the reach of 22), as `turretMount.spec.ts`. */
const BEHIND = 12;

const frames = (page: Page, n: number): Promise<void> => page.evaluate((count) => new Promise<void>((done) => {
  let left = count;
  const step = (): void => { if (--left <= 0) done(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), n);

/** One flight sample of a round the page flies (`GrenadeStats.live`). */
interface Sample { age: number; fuse: number; state: string; pos: number[]; vel: number[] }
/**
 * The spec's own read of the page's rounds, once a frame (`window.__viewer.grenade().live`; no page instrument added): a
 * round is the MGL's while its fuse is (`fuse + age` = `Timer1`; a dud's fuse is 9999999, a hand grenade's 4 s and a
 * charge's none). The page's own rounds carry no id, so a launch is told by the rounds' ages, which every live round's
 * clock advances together: a round younger than the youngest of the frame before is new -- it was not there then (the
 * youngest's age resets) -- and so is any rise in the count. No age window: a slow page's long frame gap (over half a
 * second, HF1's gate) cannot hide a launch. FireWait (1 s) is what keeps two launches apart; each new round opens a
 * launch, the youngest's samples kept (40 at most) until a round leaves (then the youngest may be an older round, so the
 * launch's samples stop there); `maxBorn` the most rounds new on one sample.
 */
interface Sampler { launches: Sample[][]; maxBorn: number; stop: boolean }

const startSampler = (page: Page): Promise<void> => page.evaluate((fuse) => {
  const s: Sampler = { launches: [], maxBorn: 0, stop: false };
  (window as unknown as { __mgl: Sampler }).__mgl = s;
  let prevYoungest: number | null = null, prevCount = 0, sampling = false;
  const step = (): void => {
    if (s.stop) return;
    const mgl = window.__viewer.grenade().live.filter((l) => Math.abs(l.fuse + l.age - fuse) < 0.05).sort((a, b) => a.age - b.age);
    const younger = prevYoungest === null ? mgl.length : mgl.filter((l) => l.age < prevYoungest!).length;
    const born = Math.max(younger, mgl.length - prevCount);
    s.maxBorn = Math.max(s.maxBorn, born);
    if (born > 0) { s.launches.push([]); sampling = true; } else if (mgl.length < prevCount) sampling = false;
    const youngest = mgl[0];
    if (youngest && sampling && s.launches[s.launches.length - 1]!.length < 40) {
      s.launches[s.launches.length - 1]!.push({ age: youngest.age, fuse: youngest.fuse, state: youngest.state, pos: [...youngest.pos], vel: [...youngest.vel] });
    }
    prevYoungest = youngest ? youngest.age : null;
    prevCount = mgl.length;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}, FUSE);

const sampler = (page: Page): Promise<Sampler> => page.evaluate(() => (window as unknown as { __mgl: Sampler }).__mgl);

/** A pull: the trigger held for `n` frames then let go (`__viewer.trigger`, as the mouse button and R1 hold it); its times. */
const pull = (page: Page, n: number, notBefore = 0): Promise<{ down: number; up: number }> => page.evaluate(async ([count, at]) => {
  while (performance.now() < at) await new Promise((r) => setTimeout(r, 10));
  const down = performance.now();
  window.__viewer.trigger(true);
  await new Promise<void>((done) => {
    let left = count;
    const step = (): void => { if (--left <= 0) done(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  window.__viewer.trigger(false);
  return { down, up: performance.now() };
}, [n, notBefore] as const);

test('MP10: mounted on mp10_turret_mgl -- the MGL box (24/24, 2 MAGS, its icon, no fire-mode row), one round a pull at 270 u/s under 39 u/s^2, none inside FireWait 1 s', async ({ page }) => {
  test.skip(!HAVE, 'needs socomlegacy/public/maps/RUN/MP10.ZDB (tools/extract-maps.ts)');
  test.setTimeout(240_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto(`${TEST_ROOM}?map=MP10&mode=play&devmode&noarmory`);
  await expect(page.locator('#status')).toContainText('BLOOD LAKE (MP10)', { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => window.__viewer.net?.()?.state ?? null), { timeout: 60_000 }).toBe('open');
  await expect.poll(() => page.evaluate(() => window.__viewer.feet()), { timeout: 60_000 }).not.toBeNull();
  await holdReleased(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await page.evaluate(() => typeof window.__viewer.teleport)).toBe('function');   // `?devmode`: the hook is there

  // The placement, research 215 s2's row.
  const { placements } = await page.evaluate(() => window.__viewer.turrets!());
  const t = placements.find((p) => p.root === ROOT)!;
  expect(t, `${ROOT} placed`).toBeTruthy();
  expect(t.id).toBe(ID);
  for (let a = 0; a < 3; a++) expect(t.origin[a]).toBeCloseTo(ORIGIN[a]!, 2);
  expect(t.limitsDeg.yaw![0]).toBeCloseTo(LIMITS.yaw[0], 3);
  expect(t.limitsDeg.yaw![1]).toBeCloseTo(LIMITS.yaw[1], 3);
  expect(t.limitsDeg.pitch![0]).toBeCloseTo(LIMITS.pitch[0], 3);
  expect(t.limitsDeg.pitch![1]).toBeCloseTo(LIMITS.pitch[1], 3);
  expect(t.mountRange).toBeCloseTo(RANGE, 3);
  expect([t.weapon, t.ammoInit]).toEqual([WEAPON, AMMO]);

  // Stood behind it on its line, facing its way, after the round's start (the launch countdown's spawn would move it back).
  const f = (t.facing * Math.PI) / 180;                              // the gun's line is (-sin f, 0, -cos f)
  const stand: [number, number, number] = [t.origin[0] + BEHIND * Math.sin(f), t.origin[1], t.origin[2] + BEHIND * Math.cos(f)];
  await expect.poll(() => page.evaluate(() => window.__viewer.net?.()?.waiting ?? null), { timeout: 60_000 }).toBe(false);
  expect(await page.evaluate(([x, y, z, yaw]) => window.__viewer.teleport!(x, y, z, yaw), [...stand, t.facing] as const)).toBe(true);
  await frames(page, 10);
  const feet = (await page.evaluate(() => window.__viewer.feet()))!;
  expect(Math.hypot(feet[0] - stand[0], feet[2] - stand[2])).toBeLessThan(1);
  await expect.poll(() => page.evaluate(() => window.__viewer.turrets!().target), { timeout: 10_000 }).toBe(t.id);
  await expect.poll(() => page.evaluate(() => window.__viewer.hud().model.action), { timeout: 10_000 }).toBe('turret_mount');

  // X: the mount, asked of the room and answered; the HUD's model written on the frame after.
  await page.keyboard.press('KeyX');
  await expect.poll(() => page.evaluate(() => window.__viewer.turrets!().held), { timeout: 10_000 }).toBe(t.id);
  await expect.poll(() => page.evaluate(() => window.__viewer.hud().model.action), { timeout: 10_000 }).toBe('turret_dismount');
  const ammo = (): Promise<number | null> => page.evaluate((id) => window.__viewer.turrets!().turrets.find((w) => w.id === id)?.ammo ?? null, t.id);
  await expect.poll(ammo, { timeout: 10_000, message: 'the room\'s count of the turret, untouched' }).toBe(AMMO);

  // The box (PAR-55, PAR-57) and the row (PAR-56): 24/24, 2 MAGS, the MGL's icon, SINGLE, the row hidden -- in the
  // model and in what is drawn (the box's figures and icon drawn, no `firemode` quad).
  const box = async (): Promise<unknown[]> => {
    const v = await page.evaluate(() => window.__viewer.hud());
    return [v.model.rounds, v.model.capacity, v.model.spare, v.model.weaponIcon, v.model.fireMode, v.model.fireModeRow];
  };
  await expect.poll(box, { timeout: 10_000 }).toEqual([MAG, MAG, 2, ICON, 'single', false]);
  await expect.poll(async () => {
    const { visible, rects } = await page.evaluate(() => window.__viewer.hud());
    return { visible, rounds: !!rects.rounds, icon: !!rects.icon, firemode: !!rects.firemode };
  }, { timeout: 10_000, message: 'the box drawn with its icon and no fire-mode row' }).toEqual({ visible: true, rounds: true, icon: true, firemode: false });

  // The aim: the gun's facing, at its upper pitch stop (research 215 s2: 10), so the round has room to fly.
  await page.evaluate(([yaw, pitch]) => window.__viewer.setCamera({ yaw, pitch }), [t.facing, LIMITS.pitch[1]] as const);
  await frames(page, 6);
  await startSampler(page);
  await frames(page, 2);
  expect((await sampler(page)).launches).toEqual([]);

  // The first pull: one round -- the room's count down one, the page's round in flight, the box one round lighter.
  const first = await pull(page, 3);
  await expect.poll(ammo, { timeout: 10_000, message: 'the room counts the first round' }).toBe(AMMO - 1);
  await expect.poll(async () => (await sampler(page)).launches.length, { timeout: 10_000, message: 'the page flies the first round' }).toBe(1);
  await expect.poll(box, { timeout: 10_000 }).toEqual([MAG - 1, MAG, 2, ICON, 'single', false]);

  // The second pull, let go inside FireWait: none.
  const second = await pull(page, 2, first.down + 300);
  expect(second.up - first.down, 'the second pull let go inside FireWait (1 s from the first round)').toBeLessThan(FIRE_WAIT_MS - 100);
  // Read past the wait's end: a let-go pull fires nothing when it runs out either (`kit+0x818` zeroed at the let-go).
  await page.evaluate((at) => new Promise<void>((done) => { const wait = (): void => { if (performance.now() >= at) done(); else setTimeout(wait, 10); }; wait(); }), first.down + FIRE_WAIT_MS + 400);
  await frames(page, 4);
  expect(await ammo(), 'no round from the pull inside FireWait (the room)').toBe(AMMO - 1);
  expect((await sampler(page)).launches.length, 'no round from the pull inside FireWait (the page)').toBe(1);

  // The third pull, past the wait: one more.
  const third = await pull(page, 3, first.down + FIRE_WAIT_MS + 500);
  await expect.poll(ammo, { timeout: 10_000, message: 'the room counts the third pull\'s round' }).toBe(AMMO - 2);
  await expect.poll(async () => (await sampler(page)).launches.length, { timeout: 10_000, message: 'the page flies the third pull\'s round' }).toBe(2);
  await expect.poll(box, { timeout: 10_000 }).toEqual([MAG - 2, MAG, 2, ICON, 'single', false]);

  // The fourth pull, past the wait and HELD past two more FireWaits (PAR-63's review): SINGLE fires one round a pull
  // (`FUN_005c0940`, `kit+0x818`), so a held trigger fires once -- AUTO at FireWait would fire two or three here.
  const fourth = await pull(page, 150, third.down + FIRE_WAIT_MS + 200);
  expect(fourth.up - fourth.down, 'the fourth pull held past two FireWaits').toBeGreaterThan(2 * FIRE_WAIT_MS + 200);
  await expect.poll(ammo, { timeout: 10_000, message: 'the room counts the held pull\'s one round' }).toBe(AMMO - 3);
  await frames(page, 30);                                           // the third round's flight sampled
  expect(await ammo(), 'a held pull fires one round (the room)').toBe(AMMO - 3);
  expect((await sampler(page)).launches.length, 'a held pull fires one round (the page)').toBe(3);
  await page.evaluate(() => { (window as unknown as { __mgl: Sampler }).__mgl.stop = true; });
  const seen = await sampler(page);
  expect(seen.launches.length).toBe(3);
  expect(seen.maxBorn, 'one round a launch, never two at once').toBe(1);

  // Each round as PAR-59 launches it: the MGL's fuse, 270 u/s at the launch, 39 u/s^2 down while it flies free, from the
  // firepoint (TURRET_ROUND_LINE_READING: a part of the gun, within the mount's reach of its pivot).
  for (const [i, samples] of seen.launches.entries()) {
    const flying = samples.filter((s) => s.state === 'flight');
    expect(flying.length, `round ${i + 1}: sampled in flight`).toBeGreaterThan(1);
    const a = flying[0]!;
    expect(a.fuse + a.age, `round ${i + 1}: Timer1`).toBeCloseTo(FUSE, 2);
    const v0 = [a.vel[0]!, a.vel[1]! + GRAVITY * a.age, a.vel[2]!];
    expect(Math.hypot(v0[0]!, v0[1]!, v0[2]!), `round ${i + 1}: Muzzle_Velocity`).toBeCloseTo(SPEED, 0);
    // The fall between two free samples: the horizontal speed unchanged (nothing hit between) and v.y down by g x dt.
    const b = flying.find((s) => s.age > a.age && Math.abs(Math.hypot(s.vel[0]!, s.vel[2]!) - Math.hypot(a.vel[0]!, a.vel[2]!)) < 1e-6)!;
    expect(b, `round ${i + 1}: a second free sample`).toBeTruthy();
    expect((a.vel[1]! - b.vel[1]!) / (b.age - a.age), `round ${i + 1}: Gravity_Acceleration`).toBeCloseTo(GRAVITY, 1);
    const launchAt = [a.pos[0]! - a.vel[0]! * a.age, a.pos[1]! - v0[1]! * a.age + (GRAVITY * a.age * a.age) / 2, a.pos[2]! - a.vel[2]! * a.age];
    expect(Math.hypot(launchAt[0]! - t.gunOrigin[0], launchAt[1]! - t.gunOrigin[1], launchAt[2]! - t.gunOrigin[2]), `round ${i + 1}: from the firepoint`).toBeLessThanOrEqual(t.mountRange);
  }

  // Still mounted; no page error.
  expect(await page.evaluate(() => window.__viewer.turrets!().held)).toBe(t.id);
  expect(problems).toEqual([]);
});
