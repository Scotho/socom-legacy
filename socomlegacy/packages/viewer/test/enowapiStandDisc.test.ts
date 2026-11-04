// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { surfaceMaterial } from '@s2u/scene';
import { ActionPage } from '../src/actionPage';
import { FlyCamera } from '../src/camera';
import { actionRayDetail, c4Line } from '../src/equipment';
import { loadMap, type LoadedMap } from '../src/loadMap';
import { buildPageWorld, type PageWorld } from '../src/matchWorld';
import { headEye } from '../src/cameraRig';
import { headPoint } from '../src/net/shotCone';
import { WalkMode } from '../src/walk';
import { LEAD_PROBE_START_PLACEHOLDER } from '../src/playerCamera';

/**
 * PR #427, `e2e/enowapiGate.spec.ts`'s stand, found off the browser (MP62 on the dev disc, `SOCOM_DISC`; skipped, and
 * said so, without it). The page's own pieces, as the match page builds them: the map through `loadMap`, its world and
 * grid through `buildPageWorld` (`./matchWorld`, the match's `d.world()`), a `WalkMode` on that hull with its
 * `FlyCamera` scaled by the map (`fly.setScale(m.metersPerUnit)`), stood as `__viewer.teleport` stands it
 * (`walk.respawn`), turned as `__viewer.setCamera` turns it, and the prompt's pick through `ActionPage` on the use ray
 * `WalkMode.lookAim` (research 84 §19; the pick is `actionRayDetail` then `actionReachNote`, research 230 §3.4).
 *
 * The rendered run at b7e29e69b (SwiftShader) showed no lever prompt at pitch -30..+30. Fuse's stand
 * (1491.2, 172.2, 1892.25) was measured under his camera lead probe (LATER 308, reverted from #427). The walker stood
 * there settles at x 1492.09 (the hull puts it 0.89 east), and the spec faced the panel from the nominal stand, yaw
 * 176.77: from the walker's feet that look passes 0.45 east of the panel's plane (x 1490.2, facing +x), so the ray
 * never meets the panel's front and its first face is `worldmodel/g4440`, the wall at z 1917.76 behind it, at every
 * pitch to +24 (none above). The panel is met only for a yaw of about 173-174.5 from those feet, looking down 15-30.
 * The spec now stands at the feet the walker reaches, facing the panel from them (yaw 173.87), at pitch -21.
 */

const DISC = process.env.SOCOM_DISC;
const HAVE = !!DISC && existsSync(resolve(DISC, 'RUN/MP62.ZDB'));
type V3 = [number, number, number];

/** `epanel_di2`'s one polygon's middle (x 1490.2, y 184.3-189.9, z 1907.3-1912.6, facing +x; research 174 §5). */
const PANEL: V3 = [1490.2, 187.1, 1909.95];
/** The spec's stand: the feet the walker reaches when stood at Fuse's (1491.2, 172.2, 1892.25). */
const STAND: V3 = [1492.1, 172.4, 1892.25];
/** The pitch the spec looks down at: the middle of the window this test finds (-15..-30). */
const PITCH = -21;
/** Fuse's stand, as the spec had it. */
const FUSE: V3 = [1491.2, 172.2, 1892.25];
/** The spec's facing convention: the look (-sin f, 0, -cos f) toward the panel's middle (`turretMount.spec.ts`'s). */
const facing = (at: readonly number[]): number => (Math.atan2(-(PANEL[0] - at[0]!), -(PANEL[2] - at[2]!)) * 180) / Math.PI;
const PITCHES = [-30, -27, -24, -21, -18, -15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30];

interface Rig { m: LoadedMap; built: PageWorld; walk: WalkMode; fly: FlyCamera; page: ActionPage }
const rigs = new Map<string, Rig>();
async function page(stem = 'MP62', stand: V3 = STAND): Promise<Rig> {
  const had = rigs.get(stem);
  if (had) return had;
  const m = await loadMap(new FsAssetSource(DISC!), `RUN/${stem}.ZDB`);
  const built = buildPageWorld(m, { setNodeActive: () => {}, sound: () => {}, effect: () => {}, log: () => {} })!;
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  fly.setScale(m.metersPerUnit);
  const walk = new WalkMode(fly);
  walk.setGround(m.ground, stand, built.grid);
  expect(walk.setMode('walk')).toBe(true);
  const actions = new ActionPage({ world: () => built.world, feet: () => walk.feet(), aim: () => walk.lookAim(), net: () => null });
  const rig = { m, built, walk, fly, page: actions };
  rigs.set(stem, rig);
  return rig;
}

const frames = (r: Rig, n: number): void => { for (let i = 0; i < n; i++) { r.fly.update(1 / 60); r.walk.frame(1 / 60); } };

/** The spec's steps: teleport facing `yaw`, 10 frames, then each pitch turned to and held 6 frames, sampled as the HUD does. */
function look(r: Rig, at: V3, yaw: number, pitches: readonly number[]) {
  expect(r.walk.respawn(at, yaw)).toBe(true);
  frames(r, 10);
  return pitches.map((pitch) => {
    r.walk.setCamera({ yaw, pitch });
    frames(r, 6);
    r.page.sample(true);
    const aim = r.walk.lookAim()!;
    const detail = actionRayDetail(r.built.world.grid, aim.eye, aim.far, r.built.world.meta.actions, (n) => surfaceMaterial(n, ''));
    return { pitch, target: r.page.stats().target, prompt: r.page.shownPrompt(), first: detail.pick?.path ?? null, point: detail.pick?.point ?? null };
  });
}

describe('#427: the spec stands where this test found the prompt', () => {
  it("enowapiGate.spec.ts's STAND and PITCH are this test's", () => {
    // A string path: under jsdom `URL` is jsdom's, which node's `fileURLToPath` refuses.
    const spec = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../e2e/enowapiGate.spec.ts'), 'utf8');
    expect(spec).toContain(`const STAND: [number, number, number] = [${STAND.join(', ')}];`);
    expect(spec).toContain(`const PITCH = ${PITCH};`);
    expect(spec).toContain('test/enowapiStandDisc.test.ts');
  });
});

describe.skipIf(!HAVE)(`#427: the Enowapi lever stand, the page's use ray off the browser${HAVE ? '' : ' (SOCOM_DISC with RUN/MP62.ZDB absent: skipped)'}`, () => {
  it("from the spec's stand, facing the panel at pitch -21, the prompt is epanel_di2's lever, in reach, and the room's head line is not walled", async () => {
    const r = await page();
    const yaw = facing(STAND);
    expect(yaw).toBeCloseTo(173.87, 2);
    const [got] = look(r, STAND, yaw, [PITCH]);
    const feet = r.walk.feet()!;
    expect(Math.hypot(feet[0] - STAND[0], feet[2] - STAND[2]), 'the walker stays where it is stood').toBeLessThan(0.05);
    expect(got).toMatchObject({ target: 'epanel_di2', prompt: 'lever', first: 'worldmodel/epanel_di2' });
    const di2 = r.built.world.meta.actions.find((a) => a.node === 'epanel_di2')!;
    expect([di2.type, di2.range]).toEqual(['SWITCH', 20]);
    // The room's own test of the press (A5, `room.ts` `useAction`): the head's line to the struck point must not be walled
    // (PF.R18); the first-hit test may still take the camera's eye at the command (`missed` is not this test's).
    const head = headEye(r.built.grid, feet, headPoint({ feet, yaw, posture: 'stand', moveRoot: null, peek: 0 }), () => true);
    // The default material only names a clear line's material, never whether it is walled.
    const line = c4Line(r.built.grid, head, { path: 'worldmodel/epanel_di2', point: got!.point! });
    expect(line.clear || line.why !== 'walled', JSON.stringify(line)).toBe(true);
    // The window around it: the pitches -15..-30 all name the lever from here.
    const sweep = look(r, STAND, yaw, PITCHES);
    expect(sweep.filter((s) => s.target === 'epanel_di2').map((s) => s.pitch)).toEqual([-30, -27, -24, -21, -18, -15]);
  });

  it("Fuse's stand faced from the nominal stand (the spec's old yaw 176.77) never names the panel: the ray passes east of its plane to g4440 behind it", async () => {
    const r = await page();
    const yaw = facing(FUSE);
    expect(yaw).toBeCloseTo(176.77, 2);
    const sweep = look(r, FUSE, yaw, PITCHES);
    const feet = r.walk.feet()!;
    expect(feet[0], 'the hull stands the walker 0.89 east of Fuse\'s x').toBeCloseTo(1492.09, 2);
    expect(sweep.filter((s) => s.target !== null)).toEqual([]);
    for (const s of sweep) {
      if (s.pitch <= 24) {
        expect(s.first, `pitch ${s.pitch}`).toBe('worldmodel/g4440');
        expect(s.point![2]).toBeCloseTo(1917.76, 1);
        expect(s.point![0], 'east of the panel\'s plane x 1490.2').toBeGreaterThan(1490.2);
      } else {
        expect(s.first, `pitch ${s.pitch}: no face`).toBeNull();
      }
    }
  });
});

/**
 * The review's finding 2 (MP11 Death Trap, gate 1): Fuse's stand there, (1128, -100, 425) (the PR's try-it note), was
 * measured under his lead probe too. `epanel_di1`'s one polygon is x 1125.6-1130.9, y -90.0 to -84.4 at z 420.27,
 * facing +z; `worldmodel/g342_1`'s wall stands 0.27 behind it (z 420.00). Standing, main's third-person eye sits so
 * high and close that at every pitch the stance allows (to -45) the ray passes over the panel's top edge to that wall,
 * at every stand in the lever's range of 15 on its face's side (searched off this test at 0.25 steps, x +-2). Crouched
 * at (1128.3, -100, 431), the eye 13.5 lower, the lever is named; the view from the head (the scope) names it from
 * Fuse's own stand. LATER 308 (2026-10-26): at -45 the camera's lead probe runs, now from this frame's target
 * (`LEAD_PROBE_START_PLACEHOLDER`): the ray goes under the panel's bottom edge instead, to `worldmodel/g335` at y -140
 * beyond the wall's plane (z 411.7) -- the lever still unnamed. Main's -45 over the edge was measured from last frame's
 * output, the start whose eye alternates against the wall.
 */
const MP11 = !!DISC && existsSync(resolve(DISC, 'RUN/MP11.ZDB'));
const MP11_PANEL: V3 = [1128.29, -87.2, 420.27];
const MP11_FUSE: V3 = [1128, -100, 425];
const MP11_CROUCH: V3 = [1128.3, -100, 431];
const toward = (at: readonly number[]): number => (Math.atan2(-(MP11_PANEL[0] - at[0]!), -(MP11_PANEL[2] - at[2]!)) * 180) / Math.PI;

describe.skipIf(!MP11)(`#427: MP11 gate 1's lever stand, the page's use ray off the browser${MP11 ? '' : ' (SOCOM_DISC with RUN/MP11.ZDB absent: skipped)'}`, () => {
  it("standing at Fuse's stand the ray misses the panel at every pitch (over it to g342_1; at -45 under it to g335); crouched 6 back it names epanel_di1, the head's line not walled", async () => {
    const r = await page('MP11', MP11_FUSE);
    const stood = look(r, MP11_FUSE, toward(MP11_FUSE), [-45, -40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20]);
    expect(r.walk.posture()).toBe('stand');
    expect(stood.filter((s) => s.target !== null)).toEqual([]);
    for (const s of stood) {
      if (s.pitch === -45) {                                             // LATER 308: under the panel, past its plane
        expect(s.first, `pitch ${s.pitch}`).toBe('worldmodel/g335');
        expect(s.point![1]).toBeCloseTo(-140, 2);
        expect(s.point![2], `pitch ${s.pitch}: past the panel's plane, z 420.27`).toBeLessThan(420);
        continue;
      }
      expect(s.first, `pitch ${s.pitch}`).toBe('worldmodel/g342_1');
      expect(s.point![2]).toBeCloseTo(420, 2);
      expect(s.point![1], `pitch ${s.pitch}: above the panel's top edge, y -84.4`).toBeGreaterThan(-84.4);
    }
    expect(r.walk.respawn(MP11_CROUCH, toward(MP11_CROUCH))).toBe(true);
    for (let k = 0; k < 3 && r.walk.posture() !== 'crouch'; k++) { r.walk.setStance('crouch'); frames(r, 90); }
    expect(r.walk.posture()).toBe('crouch');
    const feet = r.walk.feet()!, yaw = toward(feet);
    r.walk.setCamera({ yaw, pitch: -20 });
    frames(r, 6);
    r.page.sample(true);
    expect(r.page.stats()).toMatchObject({ target: 'epanel_di1', prompt: 'lever' });
    const aim = r.walk.lookAim()!;
    const hit = actionRayDetail(r.built.world.grid, aim.eye, aim.far, r.built.world.meta.actions, (n) => surfaceMaterial(n, '')).pick!;
    expect(hit.path).toBe('worldmodel/epanel_di1');
    const head = headEye(r.built.grid, feet, headPoint({ feet, yaw, posture: 'crouch', moveRoot: null, peek: 0 }), () => true);
    const line = c4Line(r.built.grid, head, { path: hit.path, point: hit.point });
    expect(line.clear || line.why !== 'walled', JSON.stringify(line)).toBe(true);
  });
});

/**
 * LATER 491 (the reading, 2026-10-26; disc-backed, `SOCOM_DISC`): at Fuse's MP11 stand, `setCamera({ pitch: -45 })` then
 * `lookAim()` descends ~83 degrees where `FUN_00297410`'s far (D:L140987-141028) is 45 down. Not the pitch's units or
 * scale. It is LATER 308's `LEAD_PROBE_START_PLACEHOLDER = 'target'` (`./playerCamera`; research 201 section 14):
 * - At -45, n.y is 0.707 > 0.625, so the downward lead probe (`FUN_0029cbb0`) runs. Started at this frame's target, it
 *   lays the target 0.65 short of the panel wall `g342_1` (z 420).
 * - The pass (`FUN_0029bf70`, D:L143197-143660) holds the eye within 0.95 of it.
 * - The aim -- `viewFar`, the line from the passed eye through the target (LATER 305; `FUN_005aa6e0` along `FUN_00296f10`'s
 *   post-pass matrix, D:L142028) -- runs nearly straight down.
 * With `'lastOutput'` (main before B143) the same stand gives 43.5 degrees. Which start the original uses is the
 * placeholder's question, and a capture of the eye at a steep look against a wall settles it (H337). This case pins
 * the placeholder's consequence under `'target'`, not the original's behaviour; the view from the head is 45 degrees
 * under either.
 */
describe.skipIf(!MP11)(`LATER 491: the -45 use ray's ~83 degrees${MP11 ? '' : ' (SOCOM_DISC with RUN/MP11.ZDB absent: skipped)'}`, () => {
  it('under the lead probe\'s \'target\' start: the eye held ~0.95 from a target 0.65 off the wall, the far on that line ~83 down', async () => {
    expect(LEAD_PROBE_START_PLACEHOLDER).toBe('target');
    const r = await page('MP11', MP11_FUSE);                                         // the rig is shared: the case above leaves it crouched
    expect(r.walk.respawn(MP11_FUSE, toward(MP11_FUSE))).toBe(true);
    for (let k = 0; k < 3 && r.walk.posture() !== 'stand'; k++) { r.walk.setStance('stand'); frames(r, 90); }
    expect(r.walk.posture()).toBe('stand');
    r.walk.setScoped(false);
    r.walk.setCamera({ yaw: toward(MP11_FUSE), pitch: -45 });
    frames(r, 6);
    const cam = r.walk.gameCamera()!, aim = r.walk.lookAim()!;
    const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
    const down = (v: V3): number => (Math.atan2(-v[1], Math.hypot(v[0], v[2])) * 180) / Math.PI;
    const toTarget = sub(cam.target, cam.eye), toFar = sub(aim.far, aim.eye);
    expect(420 - cam.target[2]).toBeCloseTo(0.65, 1);                                 // the lead: the target near the wall
    expect(Math.hypot(...toTarget)).toBeLessThan(1);                                   // the pass's hold, not the walk's distance
    expect(Math.abs(down(toFar) - down(toTarget))).toBeLessThan(0.01);                 // viewFar: the far on that line
    expect(down(toFar)).toBeGreaterThan(80);                                            // the row's ~83, not the look's 45
    r.walk.setScoped(true);
    frames(r, 6);
    const head = r.walk.lookAim()!;
    expect(down(sub(head.far, head.eye))).toBeCloseTo(45, 2);                           // the view from the head: the look's own
  });
});
