import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
// `src/hook.ts` is types only; its `declare global` is what makes `window.__viewer` exist inside `page.evaluate`.
import type {} from '../src/hook';
import { fallThroughs, type FallFrame, type FallThrough } from '../../../tools/sweepFall';
import { TEST_ROOM } from './urls';
import { holdReleased } from './loadHold';

/**
 * A filmed walk of one map, for the owner to skim (the owner's B5, 2026-11-21: "New maps: ABANDONED and SHADOW FALLS
 * only, each after a walk"; S9: an agent walks each in a real browser, filmed, no bots on them until he says). Abandoned
 * is MP5, Shadow Falls MP64 (both SUPPRESSION, research 192). **A rendered browser run of a browser adaptation**: a test
 * instrument with no original, which changes nothing the game does.
 *
 * The baseline: the same walk, with the same record, on two maps already released -- MP2 (Frostfire) and MP51
 * (Vigilance) -- so a finding on the new maps can be set against what the released ones give under the same instrument
 * (the box's first run, 1e61300351: one airborne frame 1.2-1.8 under the pick on each new map; whether that frame is the
 * instrument's is the controller's to judge from the baseline, not this spec's: the failure rule is unchanged).
 *
 * How the player stands on the map: the test room's own world, as the release sweep opens it (`tools/release-sweep.ts`
 * `sweep`: `/testroom?map=<stem>&mode=play&fly&devmode`, then `setMode('walk')`). `?devmode` with `&fly` turns the
 * offline match off (`../src/flyAccess.ts` `soloMatchOn`), so no room, no seat and no bot is made: the page's own walk on
 * the map's hull and its world drawn. Each spawn the hook gives (`stats().spawns`, `@s2u/scene` `SPAWNS`: A and B) is
 * stood on as the sweep's `place` does (the stance set standing, the camera put `EYE` over the feet, which drops the
 * mover there). From each, about 20 s of driven input on a fake pad and the keyboard: forward toward the map's middle
 * (the midpoint of A and B; a heading, not a path -- no pathfinding), a strafe each way, a turn while running, a jump
 * (Space), and C tapped (crouch), held (prone), tapped (crouch), tapped (stand) -- the sweep's stance smoke
 * (`tools/release-sweep.ts` `cKey`, the keys' rule `../src/stanceButton.ts` `KEY_STANCE`, the hold over
 * `STANCE_HOLD_S_PLACEHOLDER`'s 0.4 s; `walk.spec.ts` presses C the same way).
 *
 * The stance presses (the box's first run read "stand" after all four, on every leg): a straight heading ends a leg
 * against whatever stands in its way, and the mover's stance gate keeps a crouch or a prone asked within about 11 units
 * of a surface ahead or 7-8 behind -- retried every tick, never taken there (`../src/mover.ts` `placeGate`,
 * `crouchRefused` / `proneRefused`; HAZARDS, "A crouch or a prone asked beside an obstacle"). So the stick is let go
 * first, and a press whose stance the hook does not show after its wait turns the facing 90 degrees at a time (at most
 * three turns) until the mover's own retry takes it: the gate is the game's and untouched; only the facing changes.
 * Each press is recorded (`stancePresses`: wanted, read, turns taken); `stances` is what the hook read.
 *
 * The picture: the page's chrome is off the frame for the owner's skim -- the backtick's clean picture (`../src/ui.ts`
 * `onChromeToggle`: `body.chrome-hidden` hides the panel, the frame counter, the fullscreen button and the dev badge;
 * `grenadeMeterCentre.spec.ts` presses it) and the developer's playtest box (`#playtest-overlay`) hidden by a style
 * tag, as `grenadeFlow.spec.ts` hides it; `chrome` in `walk.json` says what was hidden. Nothing of the picture's own
 * settings is touched: the original's look stands, dark where it is dark.
 *
 * What it records, per map, in `walk.json` beside the video (both under the test's output folder, which the box
 * fetches; Playwright's `video`, 1280 x 720, as `grenadeMeterCentre.spec.ts`): the animation frames the page ran over the
 * walk and the longest of them; every page error and console error; whether the feet ever stood under the floor the walk
 * picks under them (`../../../tools/sweepFall` `fallThroughs`, over the hook's `floorUnder`: a fall through the map); the
 * spawns walked, each one's distance to the middle at its start and end, its stances and its longest airborne spell.
 * Each frame also carries the walk's tick and that tick's feet (the hook's `ephFrame`, `?devmode`: `tick`, `y`, and
 * `prevY`, the tick before's), and a second pick made from the tick before's feet instead of the last frame's (a frame
 * can span several ticks). For every fall-through a leg keeps `fallNeighbours`: the run's frames and three either side
 * (`frames`: `t`, `dt`, `tick`, `feetY`, `tickY`, `prevTickY`, `floor` and its origin `from`, `floorTick` and its origin
 * `tickFrom`, `depth`, `air`, `stance`), and the nearest frame of an earlier tick and of a later one (`tickBefore`,
 * `tickAfter`).
 *
 * It FAILS only on a page error, a fall below the floor, or the map never drawing (no triangles or no hull within
 * the load's time). Everything else is recorded, not judged; a stance press not taken is recorded, never failed.
 *
 * What it does NOT prove: it is not a person's walk (the input is scripted; nothing about feel, controls or what a player
 * would notice); there are no bots and no match (S9), so nothing of the round, the room, the rules or the network is
 * exercised; the middle is reached only where a straight heading gets there. Not checked, by name: LATER 1003 (the
 * turret guns are not solid to rounds, two on MP5, three on MP64), LATER 1011 (AI-walkable cells with no hull floor
 * near them: MP5 318, MP64 1,939 -- the walk visits only what its headings cross), B-40 (Abandoned's L-tunnel end, an
 * obstacle players report as jumpable), LATER 833's wet spawns on Shadow Falls (a prone press in water over 2 deep is a
 * crouch by the game's rule, FUN_00581660, research 86 §6.4 -- recorded, never failed). A filmed pass is not a
 * counting run: the screencast costs the page frames, so its frame times are information only.
 *
 * Run (on the box, never beside a gate or another browser run; the host lock first; E2E_PORT and E2E_LOCAL_PORT the
 * run's own, never the owner's ports), one map a run, with the map's data served (`public/maps`) -- the two new maps,
 * then the released baseline:
 *
 *   MAP_WALK=MP64 E2E_PORT=5303 E2E_LOCAL_PORT=5304 npx playwright test packages/viewer/e2e/mapWalk.spec.ts --workers 1
 *   MAP_WALK=MP5  E2E_PORT=5303 E2E_LOCAL_PORT=5304 npx playwright test packages/viewer/e2e/mapWalk.spec.ts --workers 1
 *   MAP_WALK=MP2  E2E_PORT=5303 E2E_LOCAL_PORT=5304 npx playwright test packages/viewer/e2e/mapWalk.spec.ts --workers 1
 *   MAP_WALK=MP51 E2E_PORT=5303 E2E_LOCAL_PORT=5304 npx playwright test packages/viewer/e2e/mapWalk.spec.ts --workers 1
 *
 * Without MAP_WALK the spec is skipped (said, never a pass).
 */

const MAP = process.env['MAP_WALK'] ?? '';
const SIZE = { width: 1280, height: 720 } as const;
/** The walker's eye over the feet (`../src/walk.ts` `EYE_HEIGHT`), as the sweep's `place` puts the camera. */
const EYE = 15.4;
/** The camera's pitch at spawn (`init_aim_pitch`, the sweep's `INIT_PITCH`). */
const INIT_PITCH = -9.167;
/** A pad axis from its byte (the sweep's `axis`): 0 full one way, 255 the other, 127.5 the centre. */
const axis = (byte: number): number => (byte - 127.5) / 127.5;

test.skip(!/^MP\d+$/.test(MAP), 'MAP_WALK not set (MP64 or MP5; MP2 or MP51 the released baseline): the filmed walk runs one map a run, on the box');
test.use({ viewport: SIZE, video: { mode: 'on', size: SIZE } });

/** The page's side: a fake standard pad (the sweep's), and a recorder of every animation frame's time, feet and floor. */
const INIT = `
  window.__pad = { id: 'map walk pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
  navigator.getGamepads = () => [window.__pad];
  window.__mw = { on: false, rec: [], last: 0, prev: null };
  requestAnimationFrame(function tick(t) {
    const s = window.__mw, v = window.__viewer;
    const feet = v ? v.feet() : null;
    if (s.on && v) {
      const air = v.mover() ? v.mover().airborne : false;
      // The floor the walk picks under the feet (tools/sweepFall): from the feet as they were in the air, else the feet.
      const from = feet ? (air && s.prev ? s.prev[1] : feet[1]) : null;
      const floor = feet && v.floorUnder ? v.floorUnder(feet[0], feet[2], feet[1], from) : null;
      // The walk's tick and its feet (ephFrame, ?devmode; null without), and the pick from the tick before's feet.
      const e = v.ephFrame ? v.ephFrame() : null;
      const tickFrom = feet ? (air && e && e.prevY !== null ? e.prevY : feet[1]) : null;
      const floorTick = feet && v.floorUnder ? v.floorUnder(feet[0], feet[2], feet[1], tickFrom) : null;
      s.rec.push({ t, dt: t - s.last, feet, floor, from, air, stance: v.stance(),
        tick: e ? e.tick : null, tickY: e ? e.y : null, prevTickY: e ? e.prevY : null, floorTick, tickFrom });
    }
    s.prev = feet;
    s.last = t;
    requestAnimationFrame(tick);
  });
`;

interface Rec extends FallFrame {
  dt: number; stance: string; from: number | null;
  /** The walk's tick, its feet y and the tick before's (`ephFrame`); the pick from the tick before's feet, and its origin. */
  tick: number | null; tickY: number | null; prevTickY: number | null; floorTick: number | null; tickFrom: number | null;
}

/** A recorded frame as `fallNeighbours` keeps it (rounded to 0.01). */
const near = (r: Rec): Record<string, unknown> => {
  const q = (v: number | null | undefined): number | null => (v === null || v === undefined ? null : +v.toFixed(2));
  const y = r.feet?.[1];
  return { t: q(r.t), dt: q(r.dt), tick: r.tick, feetY: q(y), tickY: q(r.tickY), prevTickY: q(r.prevTickY),
    floor: q(r.floor), from: q(r.from), floorTick: q(r.floorTick), tickFrom: q(r.tickFrom),
    depth: y === undefined || r.floor === null ? null : q(r.floor - y), air: r.air, stance: r.stance };
};

/**
 * Each fall-through's neighbourhood (D: the baseline's evidence, recorded, never judged): the run's frames and `SIDE`
 * either side, and the nearest frame of an earlier tick and of a later one than the run's.
 */
/**
 * The running jump's wind-up on a rise (box/maps-walk-75594682c/, 2026-11-21: the SAME 1-2 frame dip on Vigilance MP51, a
 * released map, as on MP5 and MP64): the feet sink at most the wind-up's 0.785 (tools/sweepFall.ts, research 208 section
 * 4, PF-03) while the floor picked under the moving body rises with the slope, so the two together cross FALL_MARGIN for a
 * frame or two, airborne, and the body then rises. Such a run is recorded (`windUpDips`), not failed; any other run fails.
 */
const WIND_UP_SINK = 0.785;
/** Units over the wind-up's sink allowed for the recorder's rounding (feet kept to 0.01 in the record). */
const WIND_UP_SINK_SLACK = 0.05;
function isWindUpDip(rec: readonly Rec[], f: FallThrough): boolean {
  if (!f.air || f.frames > 2 || f.depth >= 2) return false;
  const k = rec.findIndex((r) => r.t === f.t);
  if (k < 1) return false;
  const run = rec.slice(k, k + f.frames);
  if (!run.every((r) => r.air)) return false;
  const before = rec.slice(Math.max(0, k - 6), k).map((r) => r.feet?.[1]).filter((y): y is number => y !== undefined);
  const low = Math.min(...run.map((r) => r.feet?.[1] ?? Infinity));
  const after = rec[k + f.frames]?.feet?.[1];
  if (!before.length || !Number.isFinite(low) || after === undefined) return false;
  return Math.max(...before) - low <= WIND_UP_SINK + WIND_UP_SINK_SLACK && after > low;
}

function fallNeighbours(rec: readonly Rec[], falls: readonly FallThrough[]): Record<string, unknown>[] {
  const SIDE = 3;
  return falls.map((f) => {
    const i = rec.findIndex((r) => r.t === f.t);
    if (i < 0) return { t: f.t, found: false };
    const j = i + f.frames - 1;
    const first = rec[i]!.tick, last = rec[j]!.tick;
    let b = i - 1; while (b >= 0 && first !== null && rec[b]!.tick !== null && rec[b]!.tick! >= first) b--;
    let a = j + 1; while (a < rec.length && last !== null && rec[a]!.tick !== null && rec[a]!.tick! <= last) a++;
    return {
      t: f.t, runFrames: f.frames, depth: f.depth,
      frames: rec.slice(Math.max(0, i - SIDE), Math.min(rec.length, j + SIDE + 1)).map(near),
      tickBefore: b >= 0 ? near(rec[b]!) : null, tickAfter: a < rec.length ? near(rec[a]!) : null,
    };
  });
}
type Win = Window & { __pad: { axes: number[]; buttons: { pressed: boolean; value: number }[]; timestamp: number }; __mw: { on: boolean; rec: Rec[] } };

async function pad(p: Page, axes: number[], buttons: Record<number, boolean> = {}): Promise<void> {
  await p.evaluate(([ax, bt]) => {
    const w = window as unknown as Win;
    w.__pad.axes = ax;
    for (const [i, on] of Object.entries(bt)) w.__pad.buttons[Number(i)] = { pressed: on, value: on ? 1 : 0 };
    w.__pad.timestamp++;
  }, [axes, buttons] as const);
}
const record = (p: Page): Promise<void> => p.evaluate(() => { const s = (window as unknown as Win).__mw; s.rec = []; s.on = true; });
const stop = (p: Page): Promise<Rec[]> => p.evaluate(() => { const s = (window as unknown as Win).__mw; s.on = false; return s.rec; });
/** The sweep's `place`: standing, the camera `EYE` over the feet at (x, y, z) facing `yaw` -- the walk drops the mover there. */
const place = (p: Page, at: readonly number[], yaw: number): Promise<void> => p.evaluate(([x, y, z, yw, pt]) => {
  window.__viewer.setStance('stand'); window.__viewer.setCamera({ x, y, z, yaw: yw, pitch: pt });
}, [at[0]!, at[1]! + EYE, at[2]!, yaw, INIT_PITCH] as [number, number, number, number, number]);
/** The yaw that faces (tx, tz) from (x, z) (yaw 0 faces -z, 90 faces -x; `walk.spec.ts` `steer`). */
const yawTo = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z)) * 180 / Math.PI;
const feet = (p: Page): Promise<[number, number, number] | null> => p.evaluate(() => window.__viewer.feet());
const flat = (a: readonly number[], b: readonly number[]): number => +Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!).toFixed(1);

test(`${MAP || 'a map'}: a filmed walk from each spawn toward the middle -- run, strafe, turn, jump, crouch, prone (no bots)`, async ({ page }) => {
  test.setTimeout(420_000);
  const pageErrors: string[] = [], consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 300)}`); });
  await page.addInitScript(INIT);
  const notes: Record<string, unknown> = { map: MAP, video: true, size: SIZE, kind: 'rendered browser run (a browser adaptation); not a counting run' };
  const write = (): void => writeFileSync(test.info().outputPath('walk.json'), JSON.stringify(notes, null, 1));

  // The map drawn: triangles and the hull in, the loading screen gone (the sweep's waits). Never drawing is a failure.
  const t0 = Date.now();
  await page.goto(`${TEST_ROOM}?map=${MAP}&mode=play&fly&devmode`);
  let drawn = true;
  try {
    await page.waitForFunction(() => (window.__viewer?.stats().triangles ?? 0) > 0 && (window.__viewer?.stats().collisionPolys ?? 0) > 0, undefined, { timeout: 180_000 });
    await page.waitForFunction(() => document.getElementById('loading')?.hidden === true, undefined, { timeout: 180_000 });
    await holdReleased(page);
  } catch { drawn = false; }
  notes['drawn'] = drawn;
  notes['loadWallMs'] = Date.now() - t0;
  if (!drawn) { notes['pageErrors'] = pageErrors; notes['consoleErrors'] = consoleErrors; write(); }
  expect(drawn, `${MAP} never drew (no triangles or no hull within 180 s)`).toBe(true);
  const st = await page.evaluate(() => { const x = window.__viewer.stats(); return { map: x.map, backend: x.backend, triangles: x.triangles, collisionPolys: x.collisionPolys, spawns: x.spawns, stand: x.stand }; });
  notes['stats'] = { map: st.map, backend: st.backend, triangles: st.triangles, collisionPolys: st.collisionPolys };

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.click(SIZE.width / 2, SIZE.height / 2);                     // the gesture the audio waits for (the sweep's)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // C: the chrome off the frame -- the backtick's clean picture (`../src/ui.ts` `onChromeToggle`, a toggle: pressed only
  // while off) and the playtest box by a style tag (`grenadeFlow.spec.ts`). The picture's settings are not touched.
  if (!(await page.evaluate(() => document.body.classList.contains('chrome-hidden')))) await page.keyboard.press('Backquote');
  await page.addStyleTag({ content: '#playtest-overlay { display:none!important }' });
  await page.waitForTimeout(300);
  notes['chrome'] = await page.evaluate(() => {
    const shown = (id: string): boolean | null => { const el = document.getElementById(id); return el ? getComputedStyle(el).display !== 'none' : null; };
    return { chromeHidden: document.body.classList.contains('chrome-hidden'), panelShown: shown('panel'), fpsShown: shown('fps'), playtestBoxShown: shown('playtest-overlay'), devPanelShown: shown('dev-panel') };
  });
  expect(await page.evaluate(() => window.__viewer.setMode('walk')), 'the walk refused (no floor at the stand)').toBe(true);
  await page.waitForTimeout(1500);

  // The spawns: A and B as the hook holds them; each stood on the floor the walk picks there (from its recorded y + 5,
  // the stand's probe origin, `../src/stand.ts`), else its recorded y. With no spawns, the stand the walk opened on.
  const raw: [number, number, number][] = st.spawns ? [st.spawns.a, st.spawns.b] : [(await feet(page))!];
  const spawns: [number, number, number][] = [];
  for (const s of raw) {
    const floor = await page.evaluate(([x, y, z]) => window.__viewer.floorUnder(x, z, y + 5), s);
    spawns.push([s[0], floor ?? s[1], s[2]]);
  }
  const middle: [number, number, number] = spawns.length > 1
    ? [(spawns[0]![0] + spawns[1]![0]) / 2, 0, (spawns[0]![2] + spawns[1]![2]) / 2] : spawns[0]!;
  notes['middle'] = [+middle[0].toFixed(1), +middle[2].toFixed(1)];

  const legs: Record<string, unknown>[] = [];
  const all: Rec[] = [];
  const stanceNow = (): Promise<string> => page.evaluate(() => window.__viewer.stance());
  /**
   * B: C down `ms` (80 a tap; 700 a hold, over `STANCE_HOLD_S_PLACEHOLDER`'s 0.4 s), the stance read 1.3 s on (the
   * sweep's `cKey`). Not `want` yet: the press may be kept by the gate (`mover.ts` `placeGate`) -- the facing turned 90
   * degrees, up to three times, 0.6 s each, so the mover's own every-tick retry can take it. What was read, and the turns.
   */
  const cKey = async (ms: number, want: string): Promise<{ want: string; got: string; turns: number }> => {
    await page.keyboard.down('KeyC'); await page.waitForTimeout(ms); await page.keyboard.up('KeyC'); await page.waitForTimeout(1300);
    let got = await stanceNow(), turns = 0;
    while (got !== want && turns < 3) {
      turns++;
      await page.evaluate(() => { const v = window.__viewer; const yaw = v.ephFrame()?.yaw ?? v.look().bodyYaw; v.setCamera({ yaw: yaw + 90 }); });
      await page.waitForTimeout(600);
      got = await stanceNow();
    }
    return { want, got, turns };
  };
  /** Forward at full stick, facing the middle from where the feet are now (a heading, re-aimed each leg). */
  const towardMiddle = async (ms: number, turn = 0): Promise<void> => {
    const f = await feet(page);
    if (f) await page.evaluate((yaw) => window.__viewer.setCamera({ yaw, pitch: 0 }), yawTo(f[0], f[2], middle[0], middle[2]));
    await pad(page, [0, axis(0), turn, 0]);
    await page.waitForTimeout(ms);
    await pad(page, [0, 0, 0, 0]);
  };
  for (const [i, spawn] of spawns.entries()) {
    await place(page, spawn, yawTo(spawn[0], spawn[2], middle[0], middle[2]));
    await page.waitForTimeout(800);
    const start = (await feet(page)) ?? spawn;
    await record(page);
    await towardMiddle(5000);                                                  // leave the spawn, toward the middle
    await pad(page, [axis(255), 0, 0, 0]); await page.waitForTimeout(1500);    // strafe right
    await pad(page, [axis(0), 0, 0, 0]); await page.waitForTimeout(1500);      // strafe left
    await pad(page, [0, 0, 0, 0]);
    await towardMiddle(2000, axis(200));                                       // a turn while running
    await pad(page, [0, axis(0), 0, 0]);
    await page.waitForTimeout(400);
    await page.keyboard.press('Space');                                        // a jump on the run
    await page.waitForTimeout(1200);
    await pad(page, [0, 0, 0, 0]);
    await towardMiddle(3000);                                                  // on toward the middle
    await pad(page, [0, 0, 0, 0]);                                             // the stick let go before the stance
    await page.waitForTimeout(400);
    const presses = [await cKey(80, 'crouch'), await cKey(700, 'prone'), await cKey(80, 'crouch'), await cKey(80, 'stand')];
    const stances = presses.map((x) => x.got);
    const rec = await stop(page);
    all.push(...rec);
    const end = (await feet(page)) ?? start;
    let air = 0, airMax = 0;
    for (const r of rec.slice(1)) { air = r.air ? air + r.dt : 0; airMax = Math.max(airMax, air); }
    const found = fallThroughs(rec);
    const windUps = found.filter((f) => isWindUpDip(rec, f));
    const falls = found.filter((f) => !windUps.includes(f));
    const dts = rec.slice(1).map((r) => r.dt);
    legs.push({
      spawn: i === 0 ? 'A' : 'B', at: spawn.map((v) => +v.toFixed(1)), start: start.map((v) => +v.toFixed(1)), end: end.map((v) => +v.toFixed(1)),
      toMiddleStart: flat(start, middle), toMiddleEnd: flat(end, middle), travelled: flat(start, end),
      frames: rec.length, longestFrameMs: dts.length ? +Math.max(...dts).toFixed(1) : null,
      stances, stancesWant: 'crouch,prone,crouch,stand', stanceWaterRule: stances.join() === 'crouch,crouch,stand,crouch',
      stancesTaken: stances.join() === 'crouch,prone,crouch,stand', stancePresses: presses,
      longestAirMs: Math.round(airMax), fallThroughs: falls, windUpDips: windUps, fallNeighbours: fallNeighbours(rec, found),
      ticksRecorded: rec.some((r) => r.tick !== null),
    });
  }

  const dts = all.filter((r, k) => k > 0).map((r) => r.dt);
  const falls = legs.flatMap((l) => l['fallThroughs'] as ReturnType<typeof fallThroughs>);
  Object.assign(notes, {
    spawnsWalked: legs.length, framesDrawn: all.length, longestFrameMs: dts.length ? +Math.max(...dts).toFixed(1) : null,
    fellBelowFloor: falls.length > 0, legs, pageErrors, consoleErrors: consoleErrors.slice(0, 50), consoleErrorCount: consoleErrors.length,
  });
  write();
  console.log(`MAPWALK ${JSON.stringify({ map: MAP, spawnsWalked: legs.length, framesDrawn: all.length, longestFrameMs: notes['longestFrameMs'], fellBelowFloor: falls.length > 0, pageErrors: pageErrors.length, consoleErrors: consoleErrors.length })}`);
  expect(pageErrors, 'page errors').toEqual([]);
  expect(falls, 'the feet under the floor the walk picks (a fall through the map)').toEqual([]);
});
