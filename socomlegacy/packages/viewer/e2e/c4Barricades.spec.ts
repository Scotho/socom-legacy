import { expect, test, type Page } from '@playwright/test';
import type {} from '../src/hook';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

// Browser test adaptation: floor/ray-checked cameras at authored barriers. Use real planting and fuse;
// observe visibility on all nine access-barrier maps, and physical blocked/open traversal on Vigilance.
const cases: { map: string; target: string; pose: [number, number, number, number, number] }[] = [
  // LATER 1139 (the release gate's red, 2026-11-19): the plant's reach is measured from the HIP, squared distance < 396
  // (about 19.9 u; FUN_005be9a0 D:L475400-475405; the 396 proven by capture later1139-c4reach, the hip point a reading).
  // These two poses stood 11-20 u back and aimed past the reach (MP11 access1: the gate's face at x 1109.4-1109.8, the eye
  // at 1129.4; MP51 access1: the planks at z 1048.0-1049.2, the eye at 1036.6). Moved to the barricade's plant point, 6 u
  // off the face, level, the eye 15.4 over the floor as before: each face runs from the floor past the hip (MP11 y -100 ..
  // -71.2, MP51 48 .. 70.7; a dev-disc read at the cut), so a player there plants standing or crouched. v2 (the owner's
  // playtest, 2026-11-19) and v3 (the runner's plantC4 diagnostic of v1, box-c4diag-8a6ea1b76: the page aims
  // (-sin yaw, -cos yaw), `walk.ts` fireAim; at MP11 the ray from x 1113.3 aiming -x passed the gate 3.5 u ahead and struck
  // g880 283 u on; at MP51 it met no front face from inside). 1139's aim takes the first opaque FRONT face (C4-GLASS,
  // `c4AimPick`; FUN_005aa6e0 front faces only). v4 (LATER 1263; the runner's diagnostics box/c4diag3-b99f86aa2/ and
  // box/c4pitch-b99f86aa2/): MP11's gate is chain-link MESH (di_chain, CHAINLINK_FENCE 0.98: looked through) in a METAL
  // frame (di_good, METAL_THICK) -- three owners with the INVISIBLE_DI shell; a LEVEL eye ray (y -84.8) crosses only the
  // mesh, so v1-v3 found no target. The pose stands 6 u west of the face (x 1103.4) aiming +x (yaw -90) and DOWN at the
  // lower rail (pitch -30: di_good at y -86.82, 38.8 of 396 from the hip; the rail top is about -86.4, so below about -25). The
  // gate plants from EITHER side where the aim strikes the metal (the owner planted from the east, 2026-11-19; v3's
  // "met from the WEST" was wrong). MP51's planks face +z (the
  // walk-in below), so the plant is made from OUTSIDE, 5.8 u off their +z face (z 1049.2), aiming -z (yaw 0); its
  // walk-out checks keep the old inside pose (`inside` below). Was:
  // MP11 [1129.407745,-84.6,460.611031,90,31.541757], MP51 [1493.095520,63.4,1036.599976,180,-18.693225].
  // 2026-11-26 (the v0.4.32 release gate's red): pitch -30 -> -40. FIRST-PERSON-RAISE (e12398d6a6, matchFirearm.ts `aiming` =
  // zoom.view()==='scope') keeps the rifle DOWN at 1x first person, so the posed root is the stand idle's 11.484, not the raised
  // Fire stand's ~10.80, and the scope eye sits ~0.7 u higher; the original's eye also reads the LIVE posed node (r0001
  // FUN_0029ae50, D:L142562 on, through FUN_002869d0; its r0004 twin 0x29c3e0), so the page follows it. FIRST-PERSON-RAISE was
  // reviewed (PASS WITH FINDINGS) and its rendered check measured the 1x eye at 115.884 against the original's ~115.89
  // (FP-NEARPOINT). A Shadow PC probe planted at -35 to -45 (first try at -42); -40 is the band's centre.
  { map: 'MP11', target: 'access1/gate_move1/access_topgate=access_topgate/good_parts/gate/di_good', pose: [1103.4,-84.6,460.611031,-90,-40] },
  { map: 'MP11', target: 'access2/gate_move2/access_topgate=access_topgate/good_parts/gate/di_good', pose: [1695.5,-4.6,272.625,81.8756103515625,-12.39] },
  { map: 'MP51', target: 'access1=access1/good_parts/di_good', pose: [1493.095520,63.4,1055.0,0,0] },
  { map: 'MP6', target: 'access1/good_parts/di_good', pose: [1641.658081,65.4,1275,0,9.926246] },
  { map: 'MP61', target: 'access1/access1=access1/good_parts/di_good', pose: [674.041992,55.143054,1021.076172,180,2.490951] },
  { map: 'MP62', target: 'access1/gate_move1/access_point=access_point/good_parts/di_good', pose: [2163.953369,225.276906,1439.350952,-90,-3.035030] },
  { map: 'MP71', target: 'access1/access_fencegate=access_fencegate/good_parts/di_good', pose: [1938,154.461264,1155.200806,180,-13.585991] },
  // DF-13: Fish Hook's access2 and access3, posed as access1 is (its eye 15.4 over the floor at 139.06, 12.25 u off
  // access_action1, aimed at the node): 12 u south of `access_action2` (1707.307, 149.028, 824.467) on g899_79 at 130 and
  // of `access_action3` (2280, 191.5, 840) on g899_71 at 179, facing +z, the pitch to the node; access3's eye 1 u west of
  // its node, off the seam between the gate's two halves at x 2280 that a ray meets neither of. Each ray's first hit is
  // the target's di_good (the hull, offline: access2 at z 823.6, access3 at z 839.5).
  { map: 'MP71', target: 'access2/access_point=access_point/good_parts/di_good', pose: [1707.306763,145.4,812.466736,180,16.822700] },
  { map: 'MP71', target: 'access3/access_frontgate=access_frontgate/good_parts/di_good', pose: [2279,194.4,828,180,-13.586] },
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
// FP-REPITCH (merge 45cc87b1ea): the zoom's switch to first person lands on the NEXT animation frame (`matchFirearm.ts`
// `walk.setScoped`, once a frame), and the switch re-pitches the look once (`walk.ts` `repitchOnSwitch`). `setCamera` and
// `walkFor` run at once, so a pose laid before that frame is replaced by the re-pitch (the release gate's red at a1f75fd3d3:
// MP11 access1's -30 lost, the line off the rail, no C4 target). The game's re-pitch stays; the spec waits for the switch
// to land (`camera().mode` 'scope') before it lays its pose, and checks the pitch it laid before it plants.
const firstPerson = async (page: Page): Promise<void> => {
  await expect.poll(() => page.evaluate(() => window.__viewer.camera()?.mode ?? null), { timeout: 10000 }).toBe('scope');
};
const pitchHeld = async (page: Page, pitch: number): Promise<void> => {
  const now = await page.evaluate(() => window.__viewer.camera()?.pitch ?? null);
  expect(now, `the look's pitch ${now}, the pose's ${pitch} (FP-REPITCH's re-pitch after the pose?)`).not.toBeNull();
  expect(Math.abs(now! - pitch), `the look's pitch ${now}, the pose's ${pitch} (FP-REPITCH's re-pitch after the pose?)`).toBeLessThanOrEqual(0.5);
};
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
    if ((c.map === 'MP11' && c.target.startsWith('access1/')) || c.map === 'MP82') {
      await page.evaluate(() => { if (window.__viewer.zoom().state === 0) window.__viewer.zoomIn(); });
      await firstPerson(page);                                   // FP-REPITCH: the switch lands before the pose
    }
    await page.evaluate(([x, y, z, yaw, pitch]) => window.__viewer.setCamera({ x, y, z, yaw, pitch }), c.pose);
    await page.evaluate(() => window.__viewer.walkFor(0.3, { forward: 0 }));
  };
  await stand();
  // MP51's walk-out checks start INSIDE (the pose before LATER 1139's re-pose; the plant is made from outside).
  const inside = async () => {
    expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
    await page.evaluate(() => window.__viewer.setCamera({ x: 1493.095520, y: 63.4, z: 1036.599976, yaw: 180, pitch: -18.693225 }));
    await page.evaluate(() => window.__viewer.walkFor(0.3, { forward: 0 }));
  };
  if (c.map === 'MP51') {
    await inside();
    // SEGMENT-BODY (re-pinned; was: the intact barrier stops the walk out of wc16 at z < 1049.2, the disc's two-sided
    // hit). Captured: r0004, ac, 2026-11-04 (agent-mail evidence eph-hunt-2026-11-01/segment-body/mp51-barricade/
    // RESULTS.md, 2 trials each way). Every wall of access1's di_good faces +z; its collider's +0x80 reads 0x41, bit 1
    // clear, so the hull's hit is one-sided (FUN_002d2890 D:L174831-174837; research 281 s4.3). From inside the
    // original walks out through it at 65 u/s (z 1046.4 -> 1050.7, no contact stored): faithful, so the walk out passes.
    // Caveat: the walking client may have been on the terrorist side (the join switched teams), not the SEAL asked for.
    await page.evaluate(() => window.__viewer.walkFor(0.7, { forward: 1 }));
    expect((await page.evaluate(() => window.__viewer.feet()))![2]).toBeGreaterThan(1049.2);
    // Walked in (-z) from outside, the planks' +z faces hold it. The r0004 capture (mp51-in-t1.csv; accessBarriers.test.ts
    // reads it frame by frame) steps 1059.577, 1057.497, 1055.417 and HOLDS at 1055.417 for 20 rows with the stick held:
    // that held frame is the stop asserted here. Its final rest 1054.375-1054.417 comes 0.65 s later from ONE half-time
    // frame step (1.042, dt 0.0167): a one-field frame the port does not model (LATER 1322; accessBarriers' GAP). Since
    // LATER 1219 the press from rest starts on a frame, so the stop no longer depends on the tick phase (1055.295 at every
    // press phase, the bare walker); before it, 1054.21 sat near the final rest by a phase accident. The tolerance is
    // LATER 681's stand-off residue, 0.6.
    expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
    await page.evaluate(() => window.__viewer.setCamera({ x: 1493.095520, y: 58.66, z: 1065, yaw: 0, pitch: 0 }));
    await page.evaluate(() => window.__viewer.walkFor(0.3, { forward: 0 }));
    await page.evaluate(() => window.__viewer.walkFor(2.5, { forward: 1 }));
    expect(Math.abs((await page.evaluate(() => window.__viewer.feet()))![2] - 1055.417)).toBeLessThanOrEqual(0.6);
  }
  await stand();
  const before = await page.evaluate(() => ({ feet: window.__viewer.feet(), ammo: window.__viewer.grenade().leftByItem.C4 }));
  await page.locator('#view').screenshot({ path: testInfo.outputPath('intact.png') });
  expect(await page.evaluate(() => window.__viewer.hud().model.c4FuseBar ?? null)).toBeNull();
  await pitchHeld(page, c.pose[4]);
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
    await inside();
    await page.evaluate(() => window.__viewer.walkFor(0.7, { forward: 1 }));
    expect((await page.evaluate(() => window.__viewer.feet()))![2]).toBeGreaterThan(1049.2);
    // Opened, the walk in from outside that the intact planks held at 1054.4 now goes through the doorway.
    expect(await page.evaluate(() => window.__viewer.setMode('walk'))).toBe(true);
    await page.evaluate(() => window.__viewer.setCamera({ x: 1493.095520, y: 58.66, z: 1065, yaw: 0, pitch: 0 }));
    await page.evaluate(() => window.__viewer.walkFor(0.3, { forward: 0 }));
    await page.evaluate(() => window.__viewer.walkFor(2.5, { forward: 1 }));
    expect((await page.evaluate(() => window.__viewer.feet()))![2]).toBeLessThan(1048);
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
  if (c.map === 'MP11' && c.target.startsWith('access1/')) {
    await page.evaluate(() => { if (window.__viewer.zoom().state === 0) window.__viewer.zoomIn(); });
    await firstPerson(page);                                     // FP-REPITCH: the switch lands before the pose
  }
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
  await pitchHeld(page, pitch);
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
