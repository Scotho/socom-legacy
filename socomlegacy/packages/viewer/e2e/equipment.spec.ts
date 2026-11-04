import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';
import { shortTurn } from '../src/yaw';

/**
 * The equipment on Frostfire (web sprint 4 M7; spec W4.R5; research 94 §C4-§C5, research 85 §9.7), one family a test,
 * each with its own developer kit (`&kit=`, devmode): the LAW (AT-4) raised from its slot and fired down the open dock
 * -- the rocket straight, accelerating, gone off where it lands, the backblast behind; the claymore placed and set off
 * by its Detonator; the PMN placed, stood on while unarmed, and set off by the SEAL on it once its 8 s have run.
 */

const SCREENS = fileURLToPath(new URL('../../../test-fixtures/screens/equipment', import.meta.url));
const SPAWN_A: [number, number, number] = [796, 100, 614];
const EYE = 15.4;
const REST_PITCH = -9.167;

const settle = (page: Page): Promise<void> => page.evaluate(
  () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
);

async function open(page: Page, kit: string, problems: string[]): Promise<void> {
  mkdirSync(SCREENS, { recursive: true });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`${TEST_ROOM}?mode=play&fly&devmode&kit=${kit}`);
  const status = page.locator('#status');
  await expect(status).toContainText('triangles');
  await page.locator('#maps').selectOption('RUN/MP2.ZDB');
  await expect(status).toContainText('FROSTFIRE (MP2)');
  await expect(status).toContainText('triangles');
  await holdReleased(page);                                   // the loading screen's hold (`./loadHold`)
  expect((await page.evaluate(() => window.__viewer.stats())).diagnostics).toEqual([]);
}

/** Walking at `at` (spawn A unless told), facing `yaw`, the aim at `pitch`. */
async function stand(page: Page, yaw: number, pitch: number, at: readonly number[] = SPAWN_A): Promise<void> {
  expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
  await page.evaluate(([x, y, z, eye, yaw, pitch]) => window.__viewer.setCamera({ x, y: y + eye, z, yaw, pitch }), [at[0]!, at[1]!, at[2]!, EYE, yaw, pitch] as const);
  await page.evaluate(() => window.__viewer.walkFor(0.3, { forward: 0 }));
}

const pull = (page: Page): Promise<void> => page.evaluate(() => { window.__viewer.trigger(true); window.__viewer.trigger(false); });

/** Browser input fixture: standard controller buttons only; no game state or kit is written. */
async function equipmentButtons(page: Page, pressed: number[]): Promise<void> {
  await page.evaluate(async pressed => {
    const pad = navigator.getGamepads()[0];
    if (!pad) throw Error('Equipment acceptance: simulated controller unavailable');
    pad.buttons.forEach((button, index) => Object.assign(button, {
      pressed: pressed.includes(index), value: pressed.includes(index) ? 1 : 0, touched: pressed.includes(index),
    }));
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  }, pressed);
}

async function equipmentPress(page: Page, button: number): Promise<void> {
  await equipmentButtons(page, [button]);
  await page.waitForTimeout(80);
  await equipmentButtons(page, []);
  await page.waitForTimeout(80);
}

/**
 * Fold 4 (product track: the e2e harness). Browser input fixture, as `equipmentButtons`: turns the SEAL to `target`
 * (degrees, `look().lookYaw`, left positive) with the standard pad's right stick -- axis 2, a push right turning to a
 * smaller yaw (`../src/look` `LookLaw.frame`: yaw = -turn_maxrate x axis; `e2e/pad.spec.ts`) -- read every frame in the
 * page, the push eased toward the target, and let go once the yaw holds within `within`. No hook writes the camera.
 * The yaw after.
 */
async function equipmentTurn(page: Page, target: number, within: number, ms = 15_000): Promise<number> {
  return page.evaluate(async ([target, within, ms]) => {
    const pad = navigator.getGamepads()[0];
    if (!pad) throw Error('Equipment acceptance: simulated controller unavailable');
    const axes = pad.axes as unknown as number[];
    const off = (): number => ((((target - window.__viewer.look().lookYaw) % 360) + 540) % 360) - 180;
    const frame = (): Promise<void> => new Promise<void>(done => requestAnimationFrame(() => done()));
    try {
      for (const end = performance.now() + ms; performance.now() < end;) {
        const d = off();
        if (Math.abs(d) <= within) {
          axes[2] = 0;
          await frame(); await frame();                      // let go: held only if the yaw stays inside
          if (Math.abs(off()) <= within) break;
          continue;
        }
        // The floor clears the look law's dead zone and cubic curve (`../src/look` `RIGHT_STICK`: zone 0.3, exponent 3):
        // fold 4's 0.35 turned next to nothing and stalled 15 degrees short of the dock (225.1 both passes).
        axes[2] = -Math.sign(d) * Math.min(0.8, Math.max(0.6, Math.abs(d) / 45));
        await frame();
      }
    } finally {
      axes[2] = 0;
    }
    await frame(); await frame();
    return window.__viewer.look().lookYaw;
  }, [target, within, ms] as const);
}

test('MLS-EQ: native quick menu keeps duplicate grenade stacks and QUICK binding independent', async ({ page }, info) => {
  const problems: string[] = [];
  page.on('pageerror', error => problems.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    const pad = { id: 'Equipment acceptance controller', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
  });
  // The ordinary pre-match ARMORY owns the kit. No &kit= override, teleport, selectItem or ammunition hook.
  await page.goto(`${TEST_ROOM}?map=MP2&mode=play&devmode`);
  await expect(page.locator('#status')).toContainText('FROSTFIRE (MP2)');
  await expect.poll(() => page.evaluate(() => window.__viewer?.armory().open ?? false)).toBe(true);
  await holdReleased(page);
  const armory = () => page.evaluate(() => window.__viewer.armory());
  const armoryPress = async (button: number) => {
    await expect.poll(async () => (await armory()).taking).toBe(true);
    await equipmentPress(page, button);
  };
  await armoryPress(0); // Cross commits the offered character.
  await expect.poll(async () => (await armory()).screen).toBe('row');
  const row = async (target: number) => {
    for (let n = 0; n < 6 && (await armory()).row !== target; n++) {
      const current = (await armory()).row;
      if (current === null) throw Error('Equipment acceptance: ARMORY row unavailable');
      await armoryPress(current > target ? 12 : 13);
    }
    expect((await armory()).row).toBe(target);
  };
  // Choose the ordinary M4A1 before preparing equipment, so a mode-program default launcher cannot lock a partner slot.
  for (let n = 0; n < 70; n++) {
    const a = await armory();
    if (a.committed !== null && a.kits[a.committed]?.[0] === 54) break;
    await armoryPress(15);
  }
  expect((await armory()).kits[(await armory()).committed!]![0]).toBe(54);
  // RUN/ZWEAPON.ZAR: M67 id 121, capacity 3, one magazine. All eight MP2 source kits permit this duplicate pick
  // through menuValves/applyPicks; each change here still goes through the rendered ARMORY's original controls.
  for (const slot of [2, 3]) {
    await row(slot + 1);
    for (let n = 0; n < 70; n++) {
      const a = await armory();
      if (a.committed !== null && a.kits[a.committed]?.[slot] === 121) break;
      await armoryPress(15);
    }
    const a = await armory();
    expect(a.committed).not.toBeNull();
    expect(a.kits[a.committed!]![slot]).toBe(121);
  }
  const a = await armory(), prepared = a.kits[a.committed!]!;
  expect(prepared.slice(2, 4)).toEqual([121, 121]);
  await row(1);
  await armoryPress(12); // Up from Primary reaches DONE.
  await expect.poll(async () => (await armory()).screen).toBe('done');
  await armoryPress(0);
  await expect.poll(async () => (await armory()).open).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__viewer.net?.()?.state ?? null)).toBe('open');
  await expect.poll(() => page.evaluate(() => window.__viewer.loadout().loadout)).toEqual(prepared);
  await expect.poll(() => page.evaluate(() => window.__viewer.hud().visible)).toBe(true);
  if (await page.locator('#panel').isVisible()) await page.locator('#panel-toggle').click();
  // Fold 4 (product track: the e2e harness). Fold 3's pass 2 threw from spawn A along the spawn's own facing (yaw 180,
  // +z) into the shed's crates about 95 u ahead (its `first-full.png`): the M67 went off at [797, 100, 709], the feet at
  // z 612, inside the M67's blast -- `Explosion_Radius` 15 x10 = 150 u, full damage to 75 u and none past 150 (research
  // 85 §1 and §7.1; the thrower is hit as anyone is, §12) -- and the thrower died, as the game says it should, the
  // spawn's refill putting slot 2 back to 3/3 before the hand's count was read (e2e-equipment-6.log). The throw is made
  // instead down the open dock the LAW test below fires along (`stand(page, 240, ...)` from the same spawn), turned to
  // with the right stick, so the M67's full-power flight (`THROW_PARAMS.maxDistanceStand` 600 u) lands well past 150 u.
  const DOCK_YAW = 240;
  const facing = await equipmentTurn(page, DOCK_YAW, 10);
  expect(Math.abs(shortTurn(facing, DOCK_YAW)), `turned to the dock with the right stick: the yaw ${facing.toFixed(1)}, not ${DOCK_YAW}`).toBeLessThanOrEqual(10);

  const inventory = () => page.evaluate(() => window.__viewer.inventory());
  // Fold 3 (E3 diagnostics, product track: the e2e harness). Folds 1-2 read slot 2's stack at 2/3 in the menu after the
  // throw and the hand on slot 2 at 3 at the end. A ring changes by a spend, a refund (the room's `stale`), a spawn's
  // refill, a resume or a new map (`../src/grenade` `spendSelected`, `giveBack`, `refill`/`setKit`, `setLeft`, `reset`;
  // `takeKit` keeps it): the trail says which, by when slot 2 went back to 3 and what moved with it -- the health, the
  // feet, the hand, the explosion.
  const trail: string[] = [];
  const note = async (step: string): Promise<void> => {
    const at = await page.evaluate(() => {
      const g = window.__viewer.grenade(), n = window.__viewer.net?.();
      return {
        t: Math.round(performance.now()), stacks: g.equipmentSlots.map(e => `${e.slot}:${e.rounds[e.current]}`), slot: g.slot,
        held: g.held, phase: g.phase, thrown: g.thrown, m67: g.leftByItem.M67, alive: window.__viewer.weaponSelect().gate.alive,
        health: window.__viewer.hud().model.health, waiting: n?.waiting ?? null, state: n?.state ?? null,
        feet: window.__viewer.feet()?.map(Math.round) ?? null, booms: g.explosions.map(x => x.pos.map(Math.round)),
      };
    }).catch((err: unknown) => ({ evaluate: String(err) }));
    trail.push(`${step} ${JSON.stringify(at)}`);
  };
  await note('seated');
  // The menu open and reading the pad (state 3: `idle` counting). R2 is pressed only while the menu reads closed -- an R2
  // in the open menu confirms a take -- and again when it stays closed: an R2 refused (`canChange`, the kit's change
  // gate) opens nothing, and the open menu shuts itself after 5 s with no step (`INVENTORY_IDLE_CLOSE`, the game's
  // rule), which a slow frame's reads and screenshots can outlast.
  const ready = () => expect.poll(async () => {
    const i = await inventory();
    if (!i.open) await equipmentPress(page, 7);
    return i.open && i.idle > 0;
  }).toBe(true);
  const highlight = async (slot: number) => {
    await ready();
    for (let n = 0; n < 6 && (await inventory()).slot !== slot; n++) { await equipmentPress(page, 12); await ready(); }
    expect((await inventory()).slot).toBe(slot);
  };
  const rendered = async (slot: number, count: string, image: string) => {
    await expect.poll(async () => {
      const i = await inventory();
      return i.open && i.slot === slot && i.texts?.find(t => t.part === 'inventoryRounds')?.text;
    }).toBe(count);
    const i = await inventory();
    expect(i.texts?.filter(t => t.part === 'inventoryRounds').map(t => t.text)).toEqual([count]);
    expect(i.texts?.some(t => t.text === '6/3')).toBe(false);
    // The HUD's last rendered geometry contains this menu's layer-1 panel and text, separately from layer-0 HUD.
    await expect.poll(() => page.evaluate(() => {
      const drawn = window.__viewer.devSeen?.().hud.drawn;
      return !!drawn?.['1:newweapnbkrnd.tif']?.length && !!drawn?.['1:font_text_01.tif']?.length;
    })).toBe(true);
    const prefix = process.env.MLS_EQUIPMENT_SCREENSHOT;
    await page.locator('#view').screenshot({ path: prefix ? `${prefix}-${image}.png` : info.outputPath(`${image}.png`) });
  };
  await ready(); // R2 opens the native inventory.
  await highlight(2);
  await rendered(2, '3/3', 'first-full');
  await equipmentPress(page, 4); // L1 binds the exact highlighted duplicate.
  expect((await inventory()).binds.l1).toBe(2);
  expect((await inventory()).texts?.some(t => t.part === 'inventoryBind' && t.text === 'QUICK 1')).toBe(true);
  await highlight(3);
  await rendered(3, '3/3', 'second-full');
  await equipmentPress(page, 0); // Cross takes the second stack, not the first stack with the same name.
  await expect.poll(async () => (await inventory()).open).toBe(false);
  await expect.poll(async () => (await inventory()).current).toBe(3);
  await equipmentPress(page, 4); // The first stack is still the L1 binding.
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().slot)).toBe(2);
  await equipmentButtons(page, [5]); // R1 holds and releases an ordinary full-power throw.
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().power)).toBeGreaterThanOrEqual(0.8);
  await equipmentButtons(page, []);
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().thrown)).toBe(1);
  await note('thrown');
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().phase)).toBe('ready');
  expect(await page.evaluate(() => window.__viewer.grenade().leftByItem.M67)).toBe(5);
  // Fold 4: the thrower outlives its own M67 before the second take. A death here refills the stacks on the respawn,
  // and the counts read after it would no longer be the throw's -- a failure that says so, never a skip.
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().explosions.length), { timeout: 15_000, message: 'the M67 went off' }).toBeGreaterThanOrEqual(1);
  for (const end = Date.now() + 1500; Date.now() < end; await page.waitForTimeout(100)) {
    const s = await page.evaluate(() => ({
      alive: window.__viewer.weaponSelect().gate.alive, health: window.__viewer.hud().model.health,
      feet: window.__viewer.feet(), boom: window.__viewer.grenade().explosions.at(-1)?.pos ?? null,
    }));
    if (s.alive) continue;
    await note('killed');
    const d = s.feet && s.boom ? Math.hypot(s.boom[0] - s.feet[0], s.boom[1] - s.feet[1], s.boom[2] - s.feet[2]) : null;
    expect(s.alive, `the thrower died after its own M67 went off (health ${s.health}): the boom at ${JSON.stringify(s.boom?.map(Math.round))}, `
      + `${d?.toFixed(0)} u from the feet ${JSON.stringify(s.feet?.map(Math.round))} (the M67 hurts out to 150 u, research 85 §7.1) -- `
      + `the throw's line is not clear; the stacks after a respawn are not the throw's. Trail:\n  ${trail.join('\n  ')}`).toBe(true);
  }
  await ready(); // R2 again, retried while the kit's change gate refuses it after the throw.
  await highlight(2);
  await rendered(2, '2/3', 'first-used');
  await note('first-used');
  await highlight(3);
  await rendered(3, '3/3', 'second-still-full');
  await note('second-still-full');
  // As the first take above: Cross takes the second stack, the menu shut and the hand on it before L1 -- an L1 in the
  // open menu binds rather than takes. Cross is pressed again only while the menu reads open (a press in a step's
  // scroll, states 4-5, is lost), and L1 only while the hand reads off the first stack (one pressed while the take is
  // under way can be refused by the kit's change gate, `canChange`).
  await expect.poll(async () => {
    if ((await inventory()).open) await equipmentPress(page, 0);
    return (await inventory()).open;
  }).toBe(false);
  await expect.poll(async () => (await inventory()).current).toBe(3);
  await note('second-taken');
  await expect.poll(async () => {
    if ((await inventory()).current !== 2) await equipmentPress(page, 4);
    return (await inventory()).current;
  }).toBe(2);
  await note('first-again');
  try {
    expect(await page.evaluate(() => window.__viewer.grenade().slot)).toBe(2);
    expect(await page.evaluate(() => window.__viewer.grenade().left)).toBe(2);
  } catch (e) {
    console.log(`EQUIPMENT stacks: the hand's count on slot 2 is not the menu's 2/3 -- trail:\n  ${trail.join('\n  ')}`);
    throw e;
  }
  expect(problems).toEqual([]);
});

test('the LAW: raised from its slot, the rocket flies straight and goes off down the dock, the backblast behind', async ({ page }) => {
  const problems: string[] = [];
  await open(page, '62,15,145,185,121', problems);           // M4A1 SD, Mark 23, LAW, LAW HEAT, M67
  await stand(page, 240, 2);
  await page.waitForTimeout(1000);
  const kit = await page.evaluate(() => window.__viewer.equipment());
  expect(kit.slots.map((s) => s.name)).toEqual(['LAW', 'LAW HEAT', 'M67']);
  expect(await page.evaluate(() => window.__viewer.selectEquipment(2))).toBe(false);   // the round: a fire mode, never taken up
  expect(await page.evaluate(() => window.__viewer.selectEquipment(1))).toBe(true);
  await settle(page);
  const up = await page.evaluate(() => window.__viewer.equipment());
  expect(up).toMatchObject({ held: 'LAW', icon: 'at4_icon.tif', count: 1, roundIcon: 'firemode_at4.tif' });
  expect((await page.evaluate(() => window.__viewer.hud())).model).toMatchObject({ weaponIcon: 'at4_icon.tif', fireModeIcon: 'firemode_at4.tif', rounds: 1 });

  await pull(page);                                          // mid-raise (launcherRaiseSeconds): nothing yet
  expect((await page.evaluate(() => window.__viewer.equipment())).rocket.launched).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__viewer.equipment().rocket.wait)).toBe(0);
  await pull(page);
  await expect.poll(() => page.evaluate(() => window.__viewer.equipment().rocket.launched)).toBe(1);
  const fired = (await page.evaluate(() => window.__viewer.equipment())).rocket;
  const v = fired.lastLaunch!.velocity, speed = Math.hypot(...v);
  expect(speed).toBeCloseTo(200, 3);                          // the LAW HEAT's Muzzle_Velocity (ROCKET_LAUNCH_SPEED_READING)
  expect(fired.backblasts).toBe(1);
  const back = fired.lastBackblast!;
  expect(back.pos).toEqual(fired.lastLaunch!.from);           // from the muzzle (BACKBLAST_ORIGIN_READING) ...
  for (let i = 0; i < 3; i++) expect(back.dir[i]!).toBeCloseTo(-v[i]! / speed, 6);   // ... backwards
  expect(fired.rounds).toBe(0);                               // the LAW HEAT's one shot

  // In flight: the direction held (no fall), the speed rising at 980 u/s^2.
  const flying = async (): Promise<{ pos: number[]; vel: number[] } | null> =>
    (await page.evaluate(() => window.__viewer.grenade().live.find((l) => l.state === 'flight') ?? null));
  const a = await flying();
  await page.waitForTimeout(100);
  const b = await flying();
  if (a && b) {
    const sa = Math.hypot(...a.vel), sb = Math.hypot(...b.vel);
    expect(sb).toBeGreaterThanOrEqual(sa);
    for (let i = 0; i < 3; i++) expect(b.vel[i]! / sb).toBeCloseTo(a.vel[i]! / sa, 3);
  }
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().explosions.length), { timeout: 15_000 }).toBe(1);
  const boom = (await page.evaluate(() => window.__viewer.grenade())).explosions[0]!;
  expect(boom).toMatchObject({ item: 'LAW HEAT', detonation: 'blast', radius: 150 });
  expect(Math.hypot(boom.pos[0] - SPAWN_A[0], boom.pos[2] - SPAWN_A[2])).toBeGreaterThan(100);   // past its 10 m arming
  await page.locator('#view').screenshot({ path: join(SCREENS, 'frostfire-law-blast.png') });
  await page.waitForTimeout(3500);
  await pull(page);
  expect((await page.evaluate(() => window.__viewer.equipment())).rocket.launched).toBe(1);   // none left
  expect(problems).toEqual([]);
});

test('the claymore: placed from its slot, the Detonator up, set off only by the Detonator', async ({ page }) => {
  const problems: string[] = [];
  await open(page, '62,15,121,153,255', problems);           // M4A1 SD, Mark 23, M67, Claymore, empty
  await stand(page, 90, REST_PITCH);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__viewer.selectEquipment(3))).toBe(false);   // the empty slot
  expect(await page.evaluate(() => window.__viewer.selectEquipment(2))).toBe(true);
  expect(await page.evaluate(() => window.__viewer.selectItem('Detonator'))).toBe(false);   // none down yet
  await pull(page);
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().leftByItem.Claymore), { timeout: 5_000 }).toBe(3);
  const set = await page.evaluate(() => window.__viewer.grenade());
  expect(set).toMatchObject({ held: 'Detonator', placed: 1 });
  await expect.poll(() => page.evaluate(() => window.__viewer.hud().model.weaponIcon)).toBe('detonator_icon.tif');
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().phase), { timeout: 5_000 }).toBe('ready');
  await page.waitForTimeout(2000);
  expect((await page.evaluate(() => window.__viewer.grenade())).explosions).toHaveLength(0);   // no fuse: it waits
  await pull(page);                                          // the Detonator (CZKit_DetonateRemoteExplosives)
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().explosions.length), { timeout: 3_000 }).toBe(1);
  expect((await page.evaluate(() => window.__viewer.grenade())).explosions[0]).toMatchObject({ item: 'Claymore', radius: 250 });
  expect((await page.evaluate(() => window.__viewer.grenade())).held).toBe('Claymore');   // the claymore back up
  await page.locator('#view').screenshot({ path: join(SCREENS, 'frostfire-claymore-detonated.png') });
  expect(problems).toEqual([]);
});

test('the PMN: placed from its slot, harmless for its 8 s, then the SEAL standing on it sets it off', async ({ page }) => {
  const problems: string[] = [];
  await open(page, '62,15,121,158,194', problems);           // M4A1 SD, Mark 23, M67, PMN Mine, 2X
  await stand(page, 90, REST_PITCH);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__viewer.selectEquipment(3))).toBe(false);   // 2X holds nothing in the hand
  expect(await page.evaluate(() => window.__viewer.equipment().held)).toBeNull();
  expect(await page.evaluate(() => window.__viewer.selectEquipment(2))).toBe(true);
  expect(await page.evaluate(() => window.__viewer.equipment().held)).toBe('PMN Mine');
  await pull(page);
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().leftByItem['PMN Mine']), { timeout: 5_000 }).toBe(3);
  const down = await page.evaluate(() => window.__viewer.grenade());
  expect(down.held).toBe('PMN Mine');                          // no Detonator after a PMN
  const mine = down.live.find((l) => l.state === 'rest')!.pos;
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().phase), { timeout: 5_000 }).toBe('ready');
  await stand(page, 90, REST_PITCH, [mine[0]!, mine[1]!, mine[2]!]);   // onto it, before its Timer1 has run
  // Harmless while its Timer1 runs, judged by the mine's own age (game time): on a loaded host the steps above can take
  // longer than the 8 s, and the 2026-10-01 run's fixed 2.5 s wait then saw the trip it was right to make. Each sample
  // with the mine lying under 8 s holds no explosion; one gone between two samples went off past 8 s, or it is red.
  let last: number | null = null;
  for (const t0 = Date.now(); Date.now() - t0 < 2500;) {
    const s = await page.evaluate(() => {
      const g = window.__viewer.grenade();
      return { age: g.live.find((l) => l.state === 'rest')?.age ?? null, n: g.explosions.length };
    });
    if (s.age === null) { expect(last === null || last >= 8 - 0.5, `the PMN went off after ${last} s, inside its 8 s`).toBe(true); break; }
    if (s.age >= 8) break;
    expect(s.n, `the PMN went off at ${s.age} s, inside its 8 s`).toBe(0);
    last = s.age;
    await page.waitForTimeout(200);
  }
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().explosions.length), { timeout: 12_000 }).toBe(1);
  expect((await page.evaluate(() => window.__viewer.grenade())).explosions[0]).toMatchObject({ item: 'PMN Mine', radius: 40 });
  await page.locator('#view').screenshot({ path: join(SCREENS, 'frostfire-pmn-tripped.png') });
  expect(problems).toEqual([]);
});
